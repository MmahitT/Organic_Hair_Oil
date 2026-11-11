import request from 'supertest';
import { createApp } from '../app.js';
import { createAdminAccount } from '../services/auth.service.js';
import type { AdminRole } from '../models/common.js';

export const app = createApp();
export const api = () => request(app);

export const CUSTOMER = { name: 'Rahim Uddin', phone: '01712345678', email: 'rahim@example.com', password: 'Correct-Horse-9' };

export async function registerCustomer(overrides: Partial<typeof CUSTOMER> = {}) {
  const res = await api().post('/api/v1/auth/register').send({ ...CUSTOMER, ...overrides });
  return res;
}

export async function makeAdmin(role: AdminRole, email = `${role}@example.com`, password = 'Admin-Pass-12345') {
  await createAdminAccount({ name: `${role} user`, email, password, role });
  const res = await api().post('/api/v1/auth/admin/login').send({ email, password });
  return { token: res.body.data.accessToken as string, cookies: res.headers['set-cookie'] as unknown as string[], email, password };
}

export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
export const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };
