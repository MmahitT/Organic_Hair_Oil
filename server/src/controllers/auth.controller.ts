import type { Request, Response } from 'express';
import { Errors } from '../middleware/errorHandler.js';
import { Admin } from '../models/admin.model.js';
import { User } from '../models/user.model.js';
import * as auth from '../services/auth.service.js';
import { REFRESH_COOKIE, clearRefreshCookie, setRefreshCookie } from '../utils/cookies.js';

function respond(res: Response, status: number, r: auth.AuthResult) {
  setRefreshCookie(res, r.refreshToken);
  res.status(status).json({ success: true, data: { accessToken: r.accessToken, account: r.account } });
}

export async function register(req: Request, res: Response) {
  respond(res, 201, await auth.registerCustomer(req.body, req));
}
export async function login(req: Request, res: Response) {
  respond(res, 200, await auth.loginCustomer(req.body.identifier, req.body.password, req));
}
export async function adminLogin(req: Request, res: Response) {
  respond(res, 200, await auth.loginAdmin(req.body.email, req.body.password, req));
}
export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (typeof token !== 'string') throw Errors.unauthenticated('No session');
  try {
    respond(res, 200, await auth.refreshSession(token, req));
  } catch (e) {
    clearRefreshCookie(res);
    throw e;
  }
}
export async function logout(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE];
  await auth.logoutSession(typeof token === 'string' ? token : undefined);
  clearRefreshCookie(res);
  res.status(204).end();
}
export async function me(req: Request, res: Response) {
  const p = req.principal!;
  const account = p.kind === 'admin' ? await Admin.findById(p.id) : await User.findById(p.id);
  if (!account) throw Errors.unauthenticated();
  res.json({ success: true, data: { account } });
}
export async function changePassword(req: Request, res: Response) {
  const p = req.principal!;
  await auth.changePassword(p.kind, p.id, req.body.current, req.body.new, req);
  clearRefreshCookie(res);
  res.json({ success: true, data: { message: 'Password changed. Please sign in again.' } });
}
