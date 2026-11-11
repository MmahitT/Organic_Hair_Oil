import { Router } from 'express';
import * as c from '../controllers/auth.controller.js';
import { ah } from '../middleware/asyncHandler.js';
import { authenticate, requireCsrfHeader } from '../middleware/auth.js';
import type { Limiters } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { adminLoginSchema, changePasswordSchema, loginSchema, registerSchema } from '../validators/auth.validators.js';

export function authRouter(l: Limiters) {
  const r = Router();
  r.post('/register', l.auth, validate({ body: registerSchema }), ah(c.register));
  r.post('/login', l.auth, validate({ body: loginSchema }), ah(c.login));
  r.post('/admin/login', l.adminLogin, validate({ body: adminLoginSchema }), ah(c.adminLogin));
  r.post('/refresh', l.auth, requireCsrfHeader, ah(c.refresh));
  r.post('/logout', requireCsrfHeader, ah(c.logout));
  r.get('/me', ah(authenticate), ah(c.me));
  r.patch('/change-password', l.auth, ah(authenticate), validate({ body: changePasswordSchema }), ah(c.changePassword));
  return r;
}
