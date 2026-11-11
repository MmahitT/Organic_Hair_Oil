import type { NextFunction, Request, Response } from 'express';
import { Admin } from '../models/admin.model.js';
import { User } from '../models/user.model.js';
import { verifyAccessToken, type PrincipalKind } from '../utils/tokens.js';
import { Errors } from './errorHandler.js';

export interface Principal { id: string; kind: PrincipalKind; role: string }
declare module 'express-serve-static-core' {
  interface Request { principal?: Principal }
}

/**
 * Verifies the Bearer access token AND re-checks the account in the database,
 * so disabled/deleted accounts lose access immediately (not only at token expiry).
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw Errors.unauthenticated();
    let payload;
    try {
      payload = verifyAccessToken(header.slice(7));
    } catch {
      throw Errors.unauthenticated('Invalid or expired token');
    }
    const account =
      payload.kind === 'admin'
        ? await Admin.findById(payload.sub).select('role isActive').lean()
        : await User.findById(payload.sub).select('role isActive isBlocked').lean();
    if (!account || !account.isActive || ('isBlocked' in account && account.isBlocked)) throw Errors.unauthenticated('Account unavailable');
    req.principal = { id: payload.sub, kind: payload.kind, role: account.role as string };
    next();
  } catch (e) {
    next(e);
  }
}

/** Attaches the principal when a valid Bearer token is present, but never rejects (guest checkout stays open). */
export async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  if (!req.headers.authorization?.startsWith('Bearer ')) return next();
  try {
    const payload = verifyAccessToken(req.headers.authorization.slice(7));
    if (payload.kind === 'user') {
      const u = await User.findById(payload.sub).select('role isActive isBlocked').lean();
      if (u?.isActive && !u.isBlocked) req.principal = { id: payload.sub, kind: 'user', role: u.role as string };
    }
  } catch { /* invalid token: continue as a guest */ }
  next();
}

/** Deny-by-default role check. Must run after `authenticate`. */
export function authorize(kind: PrincipalKind, ...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const p = req.principal;
    if (!p) return next(Errors.unauthenticated());
    if (p.kind !== kind || (roles.length > 0 && !roles.includes(p.role))) return next(Errors.forbidden());
    next();
  };
}

/**
 * CSRF defence for cookie-authenticated, state-changing endpoints: require a custom header.
 * Browsers cannot send it cross-origin without a CORS preflight, which our origin allow-list rejects.
 */
export function requireCsrfHeader(req: Request, _res: Response, next: NextFunction) {
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') return next(Errors.forbidden('Missing CSRF header'));
  next();
}
