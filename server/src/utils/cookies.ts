import type { Response } from 'express';
import { env } from '../config/env.js';

const NAME = 'rt';
const PATH = '/api/v1/auth';

const base = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAMESITE,
  path: PATH,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
}) as const;

export const REFRESH_COOKIE = NAME;
export const setRefreshCookie = (res: Response, token: string) =>
  res.cookie(NAME, token, { ...base(), maxAge: env.REFRESH_TOKEN_DAYS * 86_400_000 });
export const clearRefreshCookie = (res: Response) => res.clearCookie(NAME, base());
