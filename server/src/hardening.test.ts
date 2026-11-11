import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { Writable } from 'node:stream';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createLogger, scrub, scrubUrl } from './config/logger.js';
import { AuditLog, ContactMessage, Coupon, InventoryMovement, Order, Product, Review, WebsiteSettings } from './models/index.js';
import { adminRouter } from './routes/admin.routes.js';
import { runSeed } from './scripts/seed.js';
import { clearDb, startTestDb, stopTestDb } from './test/db.js';
import { api, bearer, makeAdmin } from './test/helpers.js';

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(clearDb);

type Ids = Record<'oil' | 'powder' | 'comb' | 'combo', string>;
async function shop(stock = 20): Promise<Ids> {
  await runSeed({ stock });
  await Product.updateMany({}, { $set: { visibility: 'published' } });
  const get = async (slug: string) => String((await Product.findOne({ slug }))!._id);
  return { oil: await get('hair-oil'), powder: await get('hair-powder'), comb: await get('wooden-comb'), combo: await get('combo-oil-powder-comb') };
}
let n = 0;
const phoneOf = () => `0171${String(5000000 + n++).slice(-7)}`;
const body = (ids: Ids, over: Record<string, unknown> = {}, phone = phoneOf()) => ({
  idempotencyKey: crypto.randomUUID(), items: [{ productId: ids.oil, sku: 'HO-OIL-200', qty: 1 }],
  customer: { name: 'Rahim Uddin', phone, district: 'Rangpur', city: 'Mirpur', address: 'House 12, Road 5, Mirpur DOHS' }, paymentMethod: 'cod', allowDuplicate: true, ...over,
});
const place = (ids: Ids, over: Record<string, unknown> = {}, phone?: string) => api().post('/api/v1/checkout').send(body(ids, over, phone));

/* ------------------------------------------------------------------------------------------------ */
describe('permission matrix — every admin route is inventoried and checked', () => {
  interface R { method: string; path: string }
  const routes = (): R[] => {
    const out: R[] = [];
    for (const layer of (adminRouter() as unknown as { stack: { route?: { path: string; methods: Record<string, boolean> } }[] }).stack) {
      if (!layer.route) continue;
      for (const m of Object.keys(layer.route.methods)) out.push({ method: m, path: layer.route.path });
    }
    return out;
  };
  const concrete = (p: string) => `/api/v1/admin${p}`
    .replace(':phone', '01711111111').replace(':kind', 'cancellation').replace(':section', 'business').replace(':sku', 'HO-OIL-200').replace(/:\w+/g, 'aaaaaaaaaaaaaaaaaaaaaaaa');
  const key = (r: R) => `${r.method.toUpperCase()} ${r.path}`;

  /** The ONLY admin endpoints a "staff" account may use (orders, stock and reviews). Everything else must answer 403. */
  const STAFF_ALLOWED = new Set([
    'GET /orders/summary', 'GET /orders', 'GET /orders/:id', 'PATCH /orders/:id/status', 'PATCH /orders/:id', 'GET /orders/:id/invoice',
    'GET /inventory', 'GET /inventory/movements', 'PATCH /inventory/:productId/:sku', 'GET /reviews', 'PATCH /reviews/:id',
  ]);
  const SUPER_ONLY = (r: R) => r.path.startsWith('/staff') || r.path === '/audit-logs';

  it('finds the routes (guards against the inventory silently shrinking)', () => {
    expect(routes().length).toBeGreaterThan(60);
    expect(routes().some((r) => key(r) === 'PATCH /orders/:id/status')).toBe(true);
  });
  it('every route rejects anonymous callers with 401 and never reaches the handler', async () => {
    for (const r of routes()) {
      const res = await (request(createApp()) as unknown as Record<string, (u: string) => request.Test>)[r.method]!(concrete(r.path)).send({});
      expect(res.status, `${key(r)} anonymous`).toBe(401);
    }
  });
  it('staff get 403 on every route except the documented staff list; allowed routes pass the permission check', async () => {
    const staff = await makeAdmin('staff');
    for (const r of routes()) {
      const res = await (request(createApp()) as unknown as Record<string, (u: string) => request.Test>)[r.method]!(concrete(r.path)).set(bearer(staff.token)).send({});
      if (STAFF_ALLOWED.has(key(r))) expect(res.status, `${key(r)} staff-allowed`).not.toBe(403);
      else expect(res.status, `${key(r)} staff`).toBe(403);
    }
  });
  it('team and activity-log routes are superadmin-only (a plain admin gets 403)', async () => {
    const admin = await makeAdmin('admin');
    for (const r of routes().filter(SUPER_ONLY)) {
      const res = await (request(createApp()) as unknown as Record<string, (u: string) => request.Test>)[r.method]!(concrete(r.path)).set(bearer(admin.token)).send({});
      expect(res.status, `${key(r)} admin`).toBe(403);
    }
  });
  it('a customer token is never accepted on admin routes', async () => {
    const reg = await api().post('/api/v1/auth/register').send({ name: 'Rahim Uddin', phone: '01712345678', password: 'Correct-Horse-9' });
    const tok = reg.body.data.accessToken as string;
    for (const r of routes().slice(0, 25)) {
      const res = await (request(createApp()) as unknown as Record<string, (u: string) => request.Test>)[r.method]!(concrete(r.path)).set(bearer(tok)).send({});
      expect([401, 403], `${key(r)} customer`).toContain(res.status);
    }
  });
});

/* ------------------------------------------------------------------------------------------------ */
describe('object-level access (IDOR): one customer can never reach another’s order', () => {
  it('order status, invoice, cancel/return/review/payment claims all need THIS order’s proof', async () => {
    const ids = await shop(); await WebsiteSettings.updateOne({ key: 'main' }, { $set: { 'payments.bank': { enabled: true, bankName: 'B', accountName: 'A', accountNumber: '123456' } } });
    const a = await place(ids, {}, '01711111111'); const b = await place(ids, { paymentMethod: 'manual_bank' }, '01722222222');
    const A = a.body.data, B = b.body.data;
    const status = (orderNo: string, token: string) => api().get(`/api/v1/orders/${orderNo}/status`).query({ token });
    expect((await status(A.orderNo, A.orderToken)).status).toBe(200);
    expect((await status(B.orderNo, A.orderToken)).status).toBe(401); // A's token on B's order
    expect((await api().get(`/api/v1/orders/${B.orderNo}/invoice`).query({ token: A.orderToken })).status).toBe(401);
    expect((await api().post(`/api/v1/orders/${B.orderNo}/cancel-request`).send({ token: A.orderToken, reason: 'not mine' })).status).toBe(404);
    expect((await api().post(`/api/v1/orders/${B.orderNo}/cancel-request`).send({ phone: '01711111111', reason: 'not mine' })).status).toBe(404);
    expect((await api().post(`/api/v1/orders/${B.orderNo}/return-request`).send({ phone: '01711111111', reason: 'not mine' })).status).toBe(404);
    expect((await api().post('/api/v1/orders/track').send({ orderNo: B.orderNo, phone: '01711111111' })).status).toBe(404);
    expect((await api().post('/api/v1/payments/manual/submit').send({ orderNo: B.orderNo, token: A.orderToken, trxId: 'STOLEN1234', senderNumber: '01711111111' })).status).toBe(401);
    expect((await api().post('/api/v1/reviews').send({ orderNo: B.orderNo, phone: '01711111111', productId: ids.oil, rating: 5, comment: 'someone else’s order' })).status).toBe(404);
    expect((await Order.findOne({ orderNo: B.orderNo }))!.cancellation?.status).toBeUndefined();
  });
  it('a token for one order does not open the order list, and /orders/my only shows the caller’s orders', async () => {
    const ids = await shop();
    const mine = (await api().post('/api/v1/auth/register').send({ name: 'Rahim Uddin', phone: '01733333333', password: 'Correct-Horse-9' })).body.data.accessToken as string;
    const other = (await api().post('/api/v1/auth/register').send({ name: 'Karim Hossain', phone: '01744444444', password: 'Correct-Horse-9' })).body.data.accessToken as string;
    const o1 = await api().post('/api/v1/checkout').set(bearer(mine)).send(body(ids, {}, '01733333333'));
    const r = await api().get('/api/v1/orders/my').set(bearer(other));
    expect(r.body.data.items).toEqual([]);
    expect((await api().get('/api/v1/orders/my').set(bearer(mine))).body.data.items.map((i: { orderNo: string }) => i.orderNo)).toEqual([o1.body.data.orderNo]);
  });
  it('public order data never includes the street address, email or full phone', async () => {
    const ids = await shop();
    const r = await place(ids, { customer: { name: 'Rahim Uddin', phone: '01755555555', email: 'secret@example.com', district: 'Rangpur', city: 'Mirpur', address: 'Secret Lane 99, Hidden Para' } });
    const view = JSON.stringify([(await api().get(`/api/v1/orders/${r.body.data.orderNo}/status`).query({ token: r.body.data.orderToken })).body, (await api().post('/api/v1/orders/track').send({ orderNo: r.body.data.orderNo, phone: '01755555555' })).body]);
    for (const secret of ['Secret Lane', 'Hidden Para', 'secret@example.com', '01755555555']) expect(view).not.toContain(secret);
  });
});

/* ------------------------------------------------------------------------------------------------ */
describe('injection and hostile input', () => {
  const operators = [{ $ne: null }, { $gt: '' }, { $regex: '.*' }, { $where: 'sleep(5000)' }, { $in: ['x'] }];
  it('operator objects in every public input are refused or neutralised — never evaluated', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin');
    for (const op of operators) {
      expect((await api().post('/api/v1/auth/login').send({ identifier: op, password: 'x' })).status).toBeLessThan(500);
      expect((await api().post('/api/v1/orders/track').send({ orderNo: op, phone: op })).status).toBe(400);
      expect((await api().post('/api/v1/coupons/validate').send({ code: op, items: [{ productId: ids.oil, sku: 'HO-OIL-200', qty: 1 }] })).status).toBe(400);
      expect((await api().post('/api/v1/checkout').send(body(ids, { customer: { name: op, phone: '01711111111', district: 'Rangpur', city: 'x', address: 'long enough address' } }))).status).toBe(400);
      expect((await api().post('/api/v1/reviews').send({ orderNo: 'HO-261111-AAAAA', phone: op, productId: ids.oil, rating: 5, comment: 'hello there' })).status).toBe(400);
      expect((await api().post('/api/v1/contact').send({ name: op, phone: '01711111111', message: 'hello there' })).status).toBe(400);
      expect((await api().post('/api/v1/cart/quote').send({ items: [{ productId: op, sku: 'X', qty: 1 }] })).status).toBe(400);
    }
    // operator-shaped QUERY parameters on admin lists are sanitised, not executed
    const q = await api().get('/api/v1/admin/orders?q[$ne]=zzz&status[$ne]=pending&page[$gt]=0').set(bearer(admin.token));
    expect(q.status).toBeLessThan(500);
    expect(JSON.stringify(q.body)).not.toContain('MongoServerError');
  });
  it('script/markup/odd-character payloads are stored as inert text and always returned JSON-escaped', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin');
    const xss = `"><img src=x onerror=alert(1)><script>alert(1)</script>${'\u0000'}`;
    const r = await place(ids, { customer: { name: `Rahim ${xss}`.slice(0, 80), phone: '01766666666', district: 'Rangpur', city: 'Mirpur', address: `House 1 ${xss}`.slice(0, 280), instructions: xss.slice(0, 250) } });
    expect(r.status).toBe(201);
    const o = (await Order.findOne({ orderNo: r.body.data.orderNo }))!;
    expect(o.customer!.name).toContain('<script>'); // kept as text (the UI escapes), not executed anywhere
    const inv = await api().get(`/api/v1/admin/orders/${o._id}/invoice`).set(bearer(admin.token));
    expect(inv.text).not.toMatch(/<script>|<img src=x/); // the printable invoice escapes it
    expect(inv.headers['content-security-policy']).toMatch(/script-src 'self'/); // …and CSP forbids inline script anyway
    expect(await ContactMessage.countDocuments()).toBe(0);
    const msg = await api().post('/api/v1/contact').send({ name: 'Rahim', phone: '01711111111', message: `${xss} hello` });
    expect(msg.status).toBe(201);
    expect((await ContactMessage.findOne())!.message).toContain('<script>');
  });
  it('malformed ids, huge values and prototype-pollution keys give clean 4xx errors, never 500', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin');
    for (const path of ['/orders/not-an-id', '/products/zzz', '/payments/12345', '/customers/abc', '/coupons/%00/usage']) {
      expect((await api().get(`/api/v1/admin${path}`).set(bearer(admin.token))).status, path).toBeLessThan(500);
    }
    const poll = await api().post('/api/v1/checkout').set('Content-Type', 'application/json').send(`{"__proto__":{"admin":true},"constructor":{"prototype":{"x":1}},"idempotencyKey":"${crypto.randomUUID()}","items":[{"productId":"${ids.oil}","sku":"HO-OIL-200","qty":1}],"customer":{"name":"Rahim","phone":"01711111111","district":"Rangpur","city":"Mirpur","address":"House 12, Road 5, Mirpur"},"paymentMethod":"cod"}`);
    expect(poll.status).toBeLessThan(500);
    expect(({} as Record<string, unknown>)['admin']).toBeUndefined();
    expect((await api().get('/api/v1/products?limit=999999999&page=-5&sort[]=a&sort[]=b')).status).toBeLessThan(500);
    expect((await api().get(`/api/v1/orders/${'A'.repeat(5000)}/status?token=x`)).status).toBe(400);
  });
  it('mass assignment: protected fields cannot be set through admin updates', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin');
    const r = await api().patch(`/api/v1/admin/products/${ids.oil}`).set(bearer(admin.token)).send({ soldCount: 9999, ratingAverage: 5, ratingCount: 100, deletedAt: null, _id: new mongoose.Types.ObjectId() });
    expect(r.status).toBeLessThan(500);
    const p = (await Product.findById(ids.oil))!;
    expect(p.soldCount).not.toBe(9999);
    expect(p.ratingCount).not.toBe(100);
    const o = await place(ids);
    const order = (await Order.findOne({ orderNo: o.body.data.orderNo }))!;
    expect((await api().patch(`/api/v1/admin/orders/${order._id}`).set(bearer(admin.token)).send({ total: 1, paymentStatus: 'paid', status: 'delivered' })).status).toBe(400);
    expect((await Order.findById(order._id))!.total).toBe(610);
  });
});

/* ------------------------------------------------------------------------------------------------ */
describe('caching, privacy and logging', () => {
  it('personal-data responses are never cacheable; the public catalogue and policies have short caches', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin');
    const o = await place(ids);
    for (const res of [
      await api().get('/api/v1/admin/orders').set(bearer(admin.token)),
      await api().get(`/api/v1/orders/${o.body.data.orderNo}/status`).query({ token: o.body.data.orderToken }),
      await api().post('/api/v1/orders/track').send({ orderNo: o.body.data.orderNo, phone: '01711111111' }),
      await api().get('/api/v1/health'),
    ]) expect(res.headers['cache-control'], res.request.url).toBe('no-store');
    expect((await api().get('/api/v1/products')).headers['cache-control']).toContain('max-age=10');
    expect((await api().get('/api/v1/settings/public')).headers['cache-control']).toContain('max-age=10');
    expect((await api().get('/api/v1/legal/privacy')).headers['cache-control']).toContain('max-age=60');
  });
  it('log text is scrubbed of phone numbers, emails, tokens and JWTs', () => {
    expect(scrub('Order for 01712345678 / +8801712345678 failed')).toBe('Order for 017*****678 / 017*****678 failed');
    expect(scrub('contact karim.hossain@example.com now')).toBe('contact k***@example.com now');
    expect(scrub('Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c')).not.toContain('eyJhbGci');
    expect(scrubUrl('/api/v1/orders/HO-1/status?token=abc.def.ghi&x=1')).toBe('/api/v1/orders/HO-1/status?token=[redacted]&x=1');
    expect(scrubUrl('/api/v1/orders/HO-1/invoice?token=eyJabcdefgh.abcdefghij.abcdefghij')).not.toContain('eyJ');
  });
  it('the real logger redacts sensitive fields and scrubs errors', () => {
    let out = '';
    const sink = new Writable({ write(chunk, _enc, cb) { out += chunk.toString(); cb(); } });
    const log = createLogger(sink);
    log.level = 'info';
    log.info({ customer: { phone: '01712345678', name: 'Rahim' }, password: 'hunter2', token: 'abc', req: { headers: { authorization: 'Bearer abc', cookie: 'rt=secret' } } }, 'event');
    log.error({ err: new Error('Duplicate key { phone: "01712345678" } karim@example.com') }, 'boom');
    for (const secret of ['01712345678', 'Rahim', 'hunter2', 'Bearer abc', 'rt=secret', 'karim@example.com']) expect(out).not.toContain(secret);
    expect(out).toContain('017*****678');
  });
});

/* ------------------------------------------------------------------------------------------------ */
describe('rate limits on the sensitive public endpoints (spec §14)', () => {
  const app = () => createApp({ enforceRateLimits: true });
  const hammer = async (send: () => request.Test, limit: number) => {
    const codes: number[] = [];
    for (let i = 0; i < limit + 2; i++) codes.push((await send()).status);
    return codes;
  };
  it('checkout is limited to 10 a minute, coupons 15, reviews 5, contact 3, track 5', async () => {
    const a = app();
    const checkout = await hammer(() => request(a).post('/api/v1/checkout').send({}), 10);
    expect(checkout.slice(0, 10).every((c) => c === 400)).toBe(true);
    expect(checkout.slice(10).every((c) => c === 429)).toBe(true);
    const coupon = await hammer(() => request(a).post('/api/v1/coupons/validate').send({}), 15);
    expect(coupon.slice(0, 15).every((c) => c === 400)).toBe(true);
    expect(coupon.slice(15).every((c) => c === 429)).toBe(true);
    const review = await hammer(() => request(a).post('/api/v1/reviews').send({}), 5);
    expect(review.slice(5).every((c) => c === 429)).toBe(true);
    const contact = await hammer(() => request(a).post('/api/v1/contact').send({}), 3);
    expect(contact.slice(3).every((c) => c === 429)).toBe(true);
    const track = await hammer(() => request(a).post('/api/v1/orders/track').send({}), 5);
    expect(track.slice(5).every((c) => c === 429)).toBe(true);
    expect((await request(a).post('/api/v1/checkout').send({})).body.error.code).toBe('RATE_LIMITED');
  });
});

/* ------------------------------------------------------------------------------------------------ */
describe('audit trail covers the sensitive actions in §14', () => {
  it('records admin logins, price/stock changes, order & payment decisions, settings, exports, team and customer actions', async () => {
    const ids = await shop(30); const admin = await makeAdmin('superadmin');
    const h = bearer(admin.token);
    await api().patch(`/api/v1/admin/products/${ids.oil}`).set(h).send({ variants: [{ sku: 'HO-OIL-200', label: '200 ml', regularPrice: 560 }] });
    await api().patch(`/api/v1/admin/inventory/${ids.oil}/HO-OIL-200`).set(h).send({ set: 25, note: 'recount' });
    const o = await place(ids); const order = (await Order.findOne({ orderNo: o.body.data.orderNo }))!;
    await api().patch(`/api/v1/admin/orders/${order._id}/status`).set(h).send({ status: 'confirmed' });
    await api().put('/api/v1/admin/settings/business').set(h).send({ name: 'Beauty Organic Hair Oil', social: {} });
    await api().patch('/api/v1/admin/settings/orders').set(h).send({ autoConfirm: false });
    await api().get('/api/v1/admin/orders/export').set(h);
    await api().post('/api/v1/admin/staff').set(h).send({ name: 'Packer One', email: 'packer@example.com', password: 'Packer-Pass-123', role: 'staff' });
    await api().patch('/api/v1/admin/customers/01711111111').set(h).send({ notes: 'vip' }).catch(() => undefined);
    const cust = await api().post('/api/v1/contact').send({ name: 'Rahim', phone: '01711111111', message: 'Please call me back' });
    expect(cust.status).toBe(201);
    const msg = await ContactMessage.findOne();
    await api().patch(`/api/v1/admin/messages/${msg!._id}`).set(h).send({ status: 'done' });
    await api().post('/api/v1/admin/coupons').set(h).send({ code: 'AUDIT10', type: 'fixed', value: 10 });
    const coupon = await Coupon.findOne({ code: 'AUDIT10' });
    await api().delete(`/api/v1/admin/coupons/${coupon!._id}`).set(h);
    const actions = new Set((await AuditLog.find()).map((a) => a.action));
    for (const expected of ['admin.login', 'product.updated', 'inventory.adjusted', 'order.status', 'settings.business.update', 'settings.orders.update', 'order.export', 'staff.created', 'message.status', 'coupon.created', 'coupon.deactivated']) {
      expect(actions.has(expected), `audit entry for ${expected}`).toBe(true);
    }
    const priceLog = (await AuditLog.findOne({ action: 'product.updated' }))!;
    expect(JSON.stringify(priceLog.after)).toContain('560'); // the new price is recorded
    expect(JSON.stringify(await AuditLog.find())).not.toMatch(/Packer-Pass-123|passwordHash/); // never the password
  });
});

/* ------------------------------------------------------------------------------------------------ */
describe('concurrency — 50 parallel orders, stock of 10 (spec §17)', () => {
  it('exactly 10 succeed, 40 are refused cleanly, stock ends at 0 and every unit is accounted for', async () => {
    const ids = await shop(10);
    const results = await Promise.all(Array.from({ length: 50 }, () => place(ids)));
    const ok = results.filter((r) => r.status === 201);
    const refused = results.filter((r) => r.status !== 201);
    expect(ok).toHaveLength(10);
    expect(refused).toHaveLength(40);
    expect(refused.every((r) => r.status === 422 && r.body.error.code === 'INSUFFICIENT_STOCK')).toBe(true);
    expect((await Product.findOne({ slug: 'hair-oil' }))!.variants[0]!.stock).toBe(0);
    expect(await Order.countDocuments()).toBe(10);
    const taken = (await InventoryMovement.find({ reason: 'order' })).reduce((s, m) => s + m.delta, 0);
    expect(taken).toBe(-10);
  });
  it('a mix of buyers and cancellations never creates stock from nothing or loses any', async () => {
    const ids = await shop(10); const admin = await makeAdmin('admin');
    const first = await Promise.all(Array.from({ length: 6 }, () => place(ids)));
    const orders = await Order.find();
    const mixed = await Promise.all([
      ...orders.slice(0, 3).map((o) => api().post(`/api/v1/admin/orders/${o._id}/cancel`).set(bearer(admin.token)).send({ reason: 'test' })),
      ...Array.from({ length: 10 }, () => place(ids)),
    ]);
    void first; void mixed;
    const stock = (await Product.findOne({ slug: 'hair-oil' }))!.variants[0]!.stock;
    const live = await Order.countDocuments({ status: mongoose.trusted({ $ne: 'cancelled' }) });
    expect(stock).toBeGreaterThanOrEqual(0);
    expect(stock + live).toBe(10); // every unit is either on the shelf or in a live order
  });
  it('two admins deciding the same payment claim at once: exactly one wins', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin');
    await WebsiteSettings.updateOne({ key: 'main' }, { $set: { 'payments.bank': { enabled: true, bankName: 'B', accountName: 'A', accountNumber: '123456' } } });
    const r = await place(ids, { paymentMethod: 'manual_bank' });
    await api().post('/api/v1/payments/manual/submit').send({ orderNo: r.body.data.orderNo, token: r.body.data.orderToken, trxId: 'TRF000555' });
    const pay = (await (await import('./models/index.js')).Payment.findOne({ order: (await Order.findOne({ orderNo: r.body.data.orderNo }))!._id }))!;
    const rs = await Promise.all([true, true, false].map((approve) => api().post(`/api/v1/admin/payments/${pay._id}/resolve`).set(bearer(admin.token)).send({ approve, note: 'race' })));
    expect(rs.filter((x) => x.status === 200)).toHaveLength(1);
    const final = (await Order.findOne({ orderNo: r.body.data.orderNo }))!;
    expect(['paid', 'failed']).toContain(final.paymentStatus);
    expect(await Review.countDocuments()).toBe(0);
  });
});

/* ------------------------------------------------------------------------------------------------ */
describe('production boot refuses unsafe configuration (spec §14: "server fails fast")', () => {
  const base = {
    NODE_ENV: 'production', MONGODB_URI: 'mongodb://x', JWT_ACCESS_SECRET: 'a'.repeat(48), JWT_REFRESH_SECRET: 'b'.repeat(48), COOKIE_SECURE: 'true',
    BCRYPT_SALT_ROUNDS: '12', CORS_ORIGINS: 'https://shop.example.com', FRONTEND_URL: 'https://shop.example.com', LOG_LEVEL: 'silent',
  };
  const boot = (over: Record<string, string>) => {
    const r = spawnSync('npx', ['tsx', '-e', "import('./src/config/env.ts').then(() => console.log('BOOT_OK'))"], { cwd: new URL('..', import.meta.url).pathname, env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', ...base, ...over }, encoding: 'utf8', timeout: 60_000 });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  it('starts with a safe production configuration', () => { const r = boot({}); expect(r.out).toContain('BOOT_OK'); expect(r.code).toBe(0); }, 70_000);
  it.each([
    ['missing JWT secret', { JWT_ACCESS_SECRET: '' }, /JWT_ACCESS_SECRET/],
    ['short JWT secret', { JWT_REFRESH_SECRET: 'short' }, /JWT_REFRESH_SECRET/],
    ['insecure cookies', { COOKIE_SECURE: 'false' }, /COOKIE_SECURE/],
    ['weak password hashing', { BCRYPT_SALT_ROUNDS: '8' }, /BCRYPT_SALT_ROUNDS/],
    ['same secret for both tokens', { JWT_REFRESH_SECRET: 'a'.repeat(48) }, /must be different/],
    ['placeholder secret', { JWT_ACCESS_SECRET: 'change_me_to_a_random_string_of_at_least_32_chars' }, /placeholders/],
    ['http CORS origin', { CORS_ORIGINS: 'http://shop.example.com' }, /https/],
    ['http frontend URL', { FRONTEND_URL: 'http://shop.example.com' }, /FRONTEND_URL/],
  ])('refuses to start with %s', (_name, over, msg) => {
    const r = boot(over as Record<string, string>);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(msg);
    expect(r.out).not.toContain('BOOT_OK');
    expect(r.out).not.toContain('a'.repeat(30)); // secrets are never echoed
  }, 70_000);
});
