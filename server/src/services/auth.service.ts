import type { Request } from 'express';
import type { HydratedDocument } from 'mongoose';
import { env } from '../config/env.js';
import { Errors, AppError } from '../middleware/errorHandler.js';
import { Admin } from '../models/admin.model.js';
import type { AdminRole } from '../models/common.js';
import { User } from '../models/user.model.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../utils/password.js';
import { normalizeBdPhone } from '../utils/phone.js';
import { newRefreshToken, parseRefreshToken, signAccessToken, type PrincipalKind } from '../utils/tokens.js';
import { audit } from './audit.service.js';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const MAX_REFRESH_SESSIONS = 5;

export interface AuthResult { accessToken: string; refreshToken: string; account: Record<string, unknown> }

type Account = HydratedDocument<{ refreshTokens: { hash: string; expiresAt: Date; userAgent?: string | null }[]; role: string }>;

function modelFor(kind: PrincipalKind) {
  return (kind === 'admin' ? Admin : User) as unknown as typeof User;
}

async function issueTokens(kind: PrincipalKind, account: Account, req?: Request): Promise<{ accessToken: string; refreshToken: string }> {
  const id = String(account._id);
  const { token, hash } = newRefreshToken(kind, id);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000);
  const now = new Date();
  const live = (account.refreshTokens ?? []).filter((t) => t.expiresAt > now).slice(-(MAX_REFRESH_SESSIONS - 1));
  await modelFor(kind).updateOne(
    { _id: account._id },
    { $set: { refreshTokens: [...live, { hash, expiresAt, userAgent: req?.get('user-agent')?.slice(0, 300) }] } },
  );
  return { accessToken: signAccessToken({ sub: id, role: account.role, kind }), refreshToken: token };
}

const publicAccount = (a: { toJSON: () => Record<string, unknown> }) => a.toJSON();

export async function registerCustomer(input: { name: string; phone: string; email?: string; password: string }, req?: Request): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);
  const user = await User.create({ name: input.name, phone: input.phone, email: input.email, passwordHash });
  const tokens = await issueTokens('user', user as unknown as Account, req);
  await audit({ action: 'customer.register', req, actor: { id: String(user._id), kind: 'user', role: 'customer' }, entityType: 'User', entityId: String(user._id) });
  return { ...tokens, account: publicAccount(user) };
}

export async function loginCustomer(identifier: string, password: string, req?: Request): Promise<AuthResult> {
  const phone = normalizeBdPhone(identifier);
  const query = phone ? { phone } : { email: identifier.toLowerCase() };
  const user = await User.findOne(query).select('+passwordHash +refreshTokens');
  // Same error + similar timing for unknown account / wrong password / disabled (no account enumeration).
  const generic = () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
  if (!user) { await verifyAgainstDummy(password); throw generic(); }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok || !user.isActive || user.isBlocked) throw generic();
  user.lastLoginAt = new Date();
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: user.lastLoginAt } });
  const tokens = await issueTokens('user', user as unknown as Account, req);
  return { ...tokens, account: publicAccount(user) };
}

export async function loginAdmin(email: string, password: string, req?: Request): Promise<AuthResult> {
  const admin = await Admin.findOne({ email: email.toLowerCase() }).select('+passwordHash +refreshTokens');
  const generic = () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
  if (!admin) { await verifyAgainstDummy(password); throw generic(); }

  if (admin.lockUntil && admin.lockUntil > new Date()) {
    await audit({ action: 'admin.login.locked', req, actor: { id: String(admin._id), kind: 'admin', role: admin.role } });
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.');
  }

  const ok = await verifyPassword(password, admin.passwordHash);
  if (!ok || !admin.isActive) {
    const failed = admin.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined;
    await Admin.updateOne({ _id: admin._id }, { $set: { failedLoginCount: lock ? 0 : failed, ...(lock ? { lockUntil: lock } : {}) } });
    await audit({ action: 'admin.login.failed', req, actor: { id: String(admin._id), kind: 'admin', role: admin.role } });
    throw generic();
  }

  await Admin.updateOne({ _id: admin._id }, { $set: { failedLoginCount: 0, lastLoginAt: new Date() }, $unset: { lockUntil: 1 } });
  const tokens = await issueTokens('admin', admin as unknown as Account, req);
  await audit({ action: 'admin.login', req, actor: { id: String(admin._id), kind: 'admin', role: admin.role } });
  return { ...tokens, account: publicAccount(admin) };
}

/**
 * Rotates the refresh token. A token that is well-formed but NOT found among the account's
 * active sessions is treated as reuse (possible theft): every session of that account is revoked.
 */
export async function refreshSession(rawToken: string, req?: Request): Promise<AuthResult> {
  const parsed = parseRefreshToken(rawToken);
  if (!parsed) throw Errors.unauthenticated('Invalid session');
  const Model = modelFor(parsed.kind);
  const account = (await Model.findById(parsed.id).select('+refreshTokens')) as unknown as (Account & { isActive: boolean }) | null;
  if (!account || !account.isActive) throw Errors.unauthenticated('Invalid session');

  const now = new Date();
  const match = account.refreshTokens.find((t) => t.hash === parsed.hash);
  if (!match || match.expiresAt <= now) {
    if (!match) {
      await Model.updateOne({ _id: account._id }, { $set: { refreshTokens: [] } });
      await audit({ action: 'session.reuse_detected', req, actor: { id: parsed.id, kind: parsed.kind === 'admin' ? 'admin' : 'user' } });
    }
    throw Errors.unauthenticated('Invalid session');
  }
  account.refreshTokens = account.refreshTokens.filter((t) => t.hash !== parsed.hash);
  const tokens = await issueTokens(parsed.kind, account, req);
  return { ...tokens, account: publicAccount(account as unknown as { toJSON: () => Record<string, unknown> }) };
}

export async function logoutSession(rawToken: string | undefined): Promise<void> {
  const parsed = rawToken ? parseRefreshToken(rawToken) : null;
  if (!parsed) return;
  await modelFor(parsed.kind).updateOne({ _id: parsed.id }, { $pull: { refreshTokens: { hash: parsed.hash } } });
}

export async function changePassword(kind: PrincipalKind, id: string, current: string, next: string, req?: Request) {
  const Model = modelFor(kind);
  const account = await Model.findById(id).select('+passwordHash');
  if (!account || !(await verifyPassword(current, account.passwordHash))) throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
  await Model.updateOne({ _id: id }, { $set: { passwordHash: await hashPassword(next), refreshTokens: [] } }); // revoke all sessions
  await audit({ action: 'password.changed', req, actor: { id, kind: kind === 'admin' ? 'admin' : 'user' } });
}

export async function createAdminAccount(input: { name: string; email: string; password: string; role: AdminRole }) {
  return Admin.create({ name: input.name, email: input.email, passwordHash: await hashPassword(input.password), role: input.role });
}
