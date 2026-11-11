import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Admin, AuditLog, User } from './models/index.js';
import { clearDb, startTestDb, stopTestDb } from './test/db.js';
import { CSRF, CUSTOMER, api, bearer, makeAdmin, registerCustomer } from './test/helpers.js';

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(clearDb);

const cookieOf = (res: { headers: Record<string, unknown> }) => (res.headers['set-cookie'] as unknown as string[] | undefined)?.find((c) => c.startsWith('rt='));
const cookieValue = (c: string) => c.split(';')[0]!;

describe('customer registration', () => {
  it('registers, hashes the password, issues tokens and an httpOnly refresh cookie', async () => {
    const res = await registerCustomer({ phone: '+8801712345678' });
    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.account.phone).toBe('01712345678'); // normalised
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|refreshTokens|Correct-Horse/);
    const c = cookieOf(res)!;
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Lax/i);
    const stored = await User.findOne({ phone: '01712345678' }).select('+passwordHash');
    expect(stored!.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored!.passwordHash).not.toContain(CUSTOMER.password);
  });
  it('rejects duplicates (409), weak passwords and bad phones (400)', async () => {
    await registerCustomer();
    expect((await registerCustomer()).status).toBe(409);
    expect((await registerCustomer({ phone: '01799999999', email: 'x@y.co', password: 'short' })).status).toBe(400);
    const bad = await registerCustomer({ phone: '12345', email: 'z@y.co' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });
  it('ignores attempts to set a role (mass assignment)', async () => {
    const res = await api().post('/api/v1/auth/register').send({ ...CUSTOMER, role: 'superadmin', isActive: true });
    expect(res.status).toBe(201);
    expect(res.body.data.account.role).toBe('customer');
    expect(await Admin.countDocuments()).toBe(0);
  });
});

describe('customer login', () => {
  beforeEach(async () => { await registerCustomer(); });
  it('logs in with phone or email', async () => {
    expect((await api().post('/api/v1/auth/login').send({ identifier: '01712345678', password: CUSTOMER.password })).status).toBe(200);
    expect((await api().post('/api/v1/auth/login').send({ identifier: 'RAHIM@example.com', password: CUSTOMER.password })).status).toBe(200);
  });
  it('gives the same generic error for wrong password and unknown account', async () => {
    const a = await api().post('/api/v1/auth/login').send({ identifier: '01712345678', password: 'wrong-password' });
    const b = await api().post('/api/v1/auth/login').send({ identifier: '01899999999', password: 'wrong-password' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });
  it('blocks disabled/blocked accounts', async () => {
    await User.updateOne({ phone: '01712345678' }, { isBlocked: true });
    expect((await api().post('/api/v1/auth/login').send({ identifier: '01712345678', password: CUSTOMER.password })).status).toBe(401);
  });
  it('is not fooled by NoSQL operator injection', async () => {
    const r1 = await api().post('/api/v1/auth/login').send({ identifier: { $ne: '' }, password: { $ne: '' } });
    expect(r1.status).toBe(400);
    const r2 = await api().post('/api/v1/auth/login').send({ identifier: '01712345678', password: { $gt: '' } });
    expect(r2.status).toBe(400);
  });
});

describe('tokens, sessions and /me', () => {
  it('rejects missing, malformed, tampered and expired-style tokens', async () => {
    expect((await api().get('/api/v1/auth/me')).status).toBe(401);
    expect((await api().get('/api/v1/auth/me').set(bearer('not.a.jwt'))).status).toBe(401);
    const reg = await registerCustomer();
    const t = reg.body.data.accessToken as string;
    const tampered = t.slice(0, -3) + (t.endsWith('aaa') ? 'bbb' : 'aaa');
    expect((await api().get('/api/v1/auth/me').set(bearer(tampered))).status).toBe(401);
    expect((await api().get('/api/v1/auth/me').set(bearer(t))).status).toBe(200);
  });
  it('rejects an alg=none forged token', async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: '0'.repeat(24), role: 'superadmin', kind: 'admin' })}.`;
    expect((await api().get('/api/v1/admin/staff').set(bearer(forged))).status).toBe(401);
  });
  it('loses access immediately when the account is disabled', async () => {
    const reg = await registerCustomer();
    await User.updateOne({ phone: '01712345678' }, { isActive: false });
    expect((await api().get('/api/v1/auth/me').set(bearer(reg.body.data.accessToken))).status).toBe(401);
  });
  it('rotates refresh tokens and detects reuse of an old one', async () => {
    const reg = await registerCustomer();
    const first = cookieValue(cookieOf(reg)!);

    const r1 = await api().post('/api/v1/auth/refresh').set('Cookie', first).set(CSRF);
    expect(r1.status).toBe(200);
    const second = cookieValue(cookieOf(r1)!);
    expect(second).not.toBe(first);

    // replaying the already-used token => rejected AND every session revoked
    const replay = await api().post('/api/v1/auth/refresh').set('Cookie', first).set(CSRF);
    expect(replay.status).toBe(401);
    const afterTheft = await api().post('/api/v1/auth/refresh').set('Cookie', second).set(CSRF);
    expect(afterTheft.status).toBe(401);
    expect(await AuditLog.countDocuments({ action: 'session.reuse_detected' })).toBeGreaterThanOrEqual(1);
  });
  it('requires the CSRF header and a cookie for refresh/logout', async () => {
    const reg = await registerCustomer();
    const c = cookieValue(cookieOf(reg)!);
    expect((await api().post('/api/v1/auth/refresh').set('Cookie', c)).status).toBe(403);
    expect((await api().post('/api/v1/auth/refresh').set(CSRF)).status).toBe(401);
    expect((await api().post('/api/v1/auth/logout').set('Cookie', c)).status).toBe(403);
  });
  it('logout revokes the refresh token', async () => {
    const reg = await registerCustomer();
    const c = cookieValue(cookieOf(reg)!);
    expect((await api().post('/api/v1/auth/logout').set('Cookie', c).set(CSRF)).status).toBe(204);
    expect((await api().post('/api/v1/auth/refresh').set('Cookie', c).set(CSRF)).status).toBe(401);
  });
  it('rejects a forged refresh token', async () => {
    const reg = await registerCustomer();
    const id = reg.body.data.account._id;
    expect((await api().post('/api/v1/auth/refresh').set('Cookie', `rt=user.${id}.forged`).set(CSRF)).status).toBe(401);
    expect((await api().post('/api/v1/auth/refresh').set('Cookie', 'rt=garbage').set(CSRF)).status).toBe(401);
  });
  it('change-password verifies the current password and revokes all sessions', async () => {
    const reg = await registerCustomer();
    const t = reg.body.data.accessToken as string;
    const c = cookieValue(cookieOf(reg)!);
    expect((await api().patch('/api/v1/auth/change-password').set(bearer(t)).send({ current: 'nope-nope', new: 'Brand-New-Pass-1' })).status).toBe(401);
    expect((await api().patch('/api/v1/auth/change-password').set(bearer(t)).send({ current: CUSTOMER.password, new: 'Brand-New-Pass-1' })).status).toBe(200);
    expect((await api().post('/api/v1/auth/refresh').set('Cookie', c).set(CSRF)).status).toBe(401);
    expect((await api().post('/api/v1/auth/login').send({ identifier: CUSTOMER.phone, password: CUSTOMER.password })).status).toBe(401);
    expect((await api().post('/api/v1/auth/login').send({ identifier: CUSTOMER.phone, password: 'Brand-New-Pass-1' })).status).toBe(200);
  });
});

describe('admin authentication', () => {
  it('logs an admin in and audits it', async () => {
    const a = await makeAdmin('superadmin');
    expect(a.token).toBeTruthy();
    expect(await AuditLog.countDocuments({ action: 'admin.login' })).toBe(1);
  });
  it('does not let a customer log in through the admin endpoint (separate collections)', async () => {
    await registerCustomer();
    const res = await api().post('/api/v1/auth/admin/login').send({ email: CUSTOMER.email, password: CUSTOMER.password });
    expect(res.status).toBe(401);
  });
  it('locks the account after 5 failed attempts (423), even for the right password', async () => {
    const a = await makeAdmin('admin', 'locked@example.com');
    for (let i = 0; i < 5; i++) {
      expect((await api().post('/api/v1/auth/admin/login').send({ email: a.email, password: 'wrong-wrong-1' })).status).toBe(401);
    }
    const locked = await api().post('/api/v1/auth/admin/login').send({ email: a.email, password: a.password });
    expect(locked.status).toBe(423);
    await Admin.updateOne({ email: a.email }, { $unset: { lockUntil: 1 } });
    expect((await api().post('/api/v1/auth/admin/login').send({ email: a.email, password: a.password })).status).toBe(200);
  });
});

describe('RBAC on /admin routes', () => {
  it('denies anonymous (401), customers (403) and staff/admin on superadmin-only routes (403)', async () => {
    expect((await api().get('/api/v1/admin/staff')).status).toBe(401);

    const cust = await registerCustomer();
    expect((await api().get('/api/v1/admin/staff').set(bearer(cust.body.data.accessToken))).status).toBe(403);

    const staff = await makeAdmin('staff');
    const admin = await makeAdmin('admin');
    for (const t of [staff.token, admin.token]) {
      expect((await api().get('/api/v1/admin/staff').set(bearer(t))).status).toBe(403);
      expect((await api().get('/api/v1/admin/audit-logs').set(bearer(t))).status).toBe(403);
      expect((await api().post('/api/v1/admin/staff').set(bearer(t)).send({ name: 'Evil Co', email: 'evil@example.com', password: 'Evil-Pass-12345', role: 'admin' })).status).toBe(403);
    }
    expect(await Admin.countDocuments({ email: 'evil@example.com' })).toBe(0);
  });
  it('lets the superadmin manage staff and read the audit log', async () => {
    const sa = await makeAdmin('superadmin');
    const created = await api().post('/api/v1/admin/staff').set(bearer(sa.token)).send({ name: 'New Staff', email: 'New.Staff@Example.com', password: 'Staff-Pass-12345', role: 'staff' });
    expect(created.status).toBe(201);
    expect(created.body.data.staff.email).toBe('new.staff@example.com');
    expect(JSON.stringify(created.body)).not.toMatch(/passwordHash/);

    // cannot create a second superadmin through the API
    const bad = await api().post('/api/v1/admin/staff').set(bearer(sa.token)).send({ name: 'Another', email: 'x@example.com', password: 'Staff-Pass-12345', role: 'superadmin' });
    expect(bad.status).toBe(400);

    const list = await api().get('/api/v1/admin/staff').set(bearer(sa.token));
    expect(list.body.data.staff).toHaveLength(2);

    const logs = await api().get('/api/v1/admin/audit-logs?limit=50').set(bearer(sa.token));
    expect(logs.status).toBe(200);
    expect(logs.body.data.items.map((l: { action: string }) => l.action)).toContain('staff.created');
    expect(JSON.stringify(logs.body)).not.toMatch(/Staff-Pass-12345/);
  });
  it('deactivating staff revokes their access immediately and protects the superadmin', async () => {
    const sa = await makeAdmin('superadmin');
    const staff = await makeAdmin('staff');
    const staffDoc = await Admin.findOne({ email: staff.email });
    const off = await api().patch(`/api/v1/admin/staff/${staffDoc!._id}`).set(bearer(sa.token)).send({ isActive: false });
    expect(off.status).toBe(200);
    expect((await api().get('/api/v1/auth/me').set(bearer(staff.token))).status).toBe(401);
    const saDoc = await Admin.findOne({ email: sa.email });
    expect((await api().patch(`/api/v1/admin/staff/${saDoc!._id}`).set(bearer(sa.token)).send({ isActive: false })).status).toBe(403);
    expect((await api().patch('/api/v1/admin/staff/not-an-id').set(bearer(sa.token)).send({ isActive: false })).status).toBe(400);
  });
});
