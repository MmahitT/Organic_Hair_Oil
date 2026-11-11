import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export type PrincipalKind = 'user' | 'admin';
export interface AccessPayload { sub: string; role: string; kind: PrincipalKind }

const ISS = 'beauty-organic-api';
const AUD = 'beauty-organic-clients';

export function signAccessToken(p: AccessPayload): string {
  return jwt.sign({ role: p.role, kind: p.kind }, env.JWT_ACCESS_SECRET, {
    subject: p.sub, issuer: ISS, audience: AUD, algorithm: 'HS256',
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const d = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: ISS, audience: AUD, algorithms: ['HS256'] }) as jwt.JwtPayload;
  if (typeof d.sub !== 'string' || typeof d['role'] !== 'string' || (d['kind'] !== 'user' && d['kind'] !== 'admin')) {
    throw new Error('Malformed token');
  }
  return { sub: d.sub, role: d['role'], kind: d['kind'] };
}

/** Opaque refresh token: "<kind>.<accountId>.<secret>". Only a keyed hash of the secret is stored. */
export function newRefreshToken(kind: PrincipalKind, id: string): { token: string; hash: string } {
  const secret = crypto.randomBytes(48).toString('base64url');
  return { token: `${kind}.${id}.${secret}`, hash: hashRefreshSecret(secret) };
}

export function hashRefreshSecret(secret: string): string {
  return crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(secret).digest('hex');
}

export function parseRefreshToken(token: string): { kind: PrincipalKind; id: string; hash: string } | null {
  const [kind, id, secret, ...rest] = token.split('.');
  if (rest.length || !secret || !id || (kind !== 'user' && kind !== 'admin')) return null;
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  return { kind, id, hash: hashRefreshSecret(secret) };
}

// Short-lived token proving "you just placed this order" so the confirmation page can load it. Distinct audience
// and derived secret mean it can never be used as an access token.
const ORDER_AUD = 'order-status';
const orderSecret = () => `${env.JWT_ACCESS_SECRET}:order-status`;
export function signOrderToken(orderNo: string): string {
  return jwt.sign({}, orderSecret(), { subject: orderNo, audience: ORDER_AUD, issuer: ISS, expiresIn: '24h', algorithm: 'HS256' });
}
export function verifyOrderToken(token: string): string | null {
  try {
    const d = jwt.verify(token, orderSecret(), { audience: ORDER_AUD, issuer: ISS, algorithms: ['HS256'] }) as jwt.JwtPayload;
    return typeof d.sub === 'string' ? d.sub : null;
  } catch { return null; }
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
