import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { registerEmailProvider, registerSmsProvider } from './integrations/notifications.js';
import { Coupon, CouponRedemption, InventoryMovement, Notification, Order, Payment, Product, Review, WebsiteSettings } from './models/index.js';
import { runSeed } from './scripts/seed.js';
import { processNotifications } from './services/notification.service.js';
import { clearDb, startTestDb, stopTestDb } from './test/db.js';
import { api, bearer, makeAdmin, registerCustomer } from './test/helpers.js';

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(async () => { await clearDb(); registerEmailProvider(null); registerSmsProvider(null); });

type Ids = Record<'oil' | 'powder' | 'comb' | 'combo', string>;
async function shop(stock = 20): Promise<Ids> {
  await runSeed({ stock });
  await Product.updateMany({}, { $set: { visibility: 'published' } });
  const get = async (slug: string) => String((await Product.findOne({ slug }))!._id);
  return { oil: await get('hair-oil'), powder: await get('hair-powder'), comb: await get('wooden-comb'), combo: await get('combo-oil-powder-comb') };
}
let n = 0;
const phoneOf = () => `0171${String(3000000 + n++).slice(-7)}`;
async function place(ids: Ids, over: Record<string, unknown> = {}, who: { phone?: string; email?: string; name?: string } = {}, headers: Record<string, string> = {}) {
  const phone = who.phone ?? phoneOf();
  const res = await api().post('/api/v1/checkout').set(headers).send({
    idempotencyKey: crypto.randomUUID(), items: [{ productId: ids.oil, sku: 'HO-OIL-200', qty: 1 }],
    customer: { name: who.name ?? 'Rahim Uddin', phone, district: 'Rangpur', city: 'Mirpur', address: 'House 12, Road 5, Mirpur DOHS', ...(who.email ? { email: who.email } : {}) },
    paymentMethod: 'cod', ...over,
  });
  expect(res.status).toBe(201);
  const order = (await Order.findOne({ orderNo: res.body.data.orderNo }))!;
  return { order, phone, token: res.body.data.orderToken as string, id: String(order._id), orderNo: order.orderNo };
}
const stock = async (slug = 'hair-oil') => (await Product.findOne({ slug }))!.variants[0]!.stock;
const patchStatus = (token: string, id: string, status: string, note?: string) => api().patch(`/api/v1/admin/orders/${id}/status`).set(bearer(token)).send({ status, note });
async function deliver(token: string, id: string) {
  for (const s of ['confirmed', 'shipped', 'delivered']) expect((await patchStatus(token, id, s)).status).toBe(200);
}

describe('status workflow', () => {
  it('moves forward through the valid steps and records who did what', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin'); const o = await place(ids);
    for (const s of ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered']) {
      const r = await patchStatus(admin.token, o.id, s, `to ${s}`);
      expect(r.status).toBe(200);
    }
    const done = (await Order.findById(o.id))!;
    expect(done.status).toBe('delivered');
    expect(done.deliveredAt).toBeInstanceOf(Date);
    expect(done.statusHistory.map((h) => h.status)).toEqual(['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered']);
    expect(done.statusHistory.at(-1)!.by).toContain('admin user');
  });
  it('rejects skipped, backward and terminal moves with INVALID_TRANSITION', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin'); const o = await place(ids);
    for (const bad of ['shipped', 'delivered', 'out_for_delivery', 'processing']) {
      const r = await patchStatus(admin.token, o.id, bad);
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe('INVALID_TRANSITION');
    }
    await patchStatus(admin.token, o.id, 'confirmed');
    expect((await patchStatus(admin.token, o.id, 'pending')).status).toBe(400); // not an allowed target at all
    await deliver(admin.token, o.id).catch(() => undefined);
    expect((await patchStatus(admin.token, o.id, 'confirmed')).body.error.code).toBe('INVALID_TRANSITION');
    expect((await api().patch(`/api/v1/admin/orders/${o.id}/status`).set(bearer(admin.token)).send({ status: 'cancelled' })).status).toBe(400); // cancelling has its own endpoint
  });
  it('collecting cash on delivery marks the payment collected', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin'); const o = await place(ids);
    await patchStatus(admin.token, o.id, 'confirmed'); await patchStatus(admin.token, o.id, 'shipped');
    expect((await Order.findById(o.id))!.paymentStatus).toBe('cod_pending');
    await patchStatus(admin.token, o.id, 'delivered');
    expect((await Order.findById(o.id))!.paymentStatus).toBe('cod_collected');
    expect((await Payment.findOne({ order: o.id }))!.status).toBe('cod_collected');
  });
  it('will not process an unpaid online/manual order', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin');
    await WebsiteSettings.updateOne({ key: 'main' }, { $set: { 'payments.manual': { enabled: true, bkash: '01711111111' } } });
    const o = await place(ids, { paymentMethod: 'manual_bkash' });
    const r = await patchStatus(admin.token, o.id, 'confirmed');
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('PAYMENT_REQUIRED');
    await Order.updateOne({ _id: o.id }, { $set: { paymentStatus: 'paid' } });
    expect((await patchStatus(admin.token, o.id, 'confirmed')).status).toBe(200);
  });
  it('lets staff move orders along but not cancel or return them; requires login', async () => {
    const ids = await shop(); const staff = await makeAdmin('staff'); const o = await place(ids);
    expect((await api().patch(`/api/v1/admin/orders/${o.id}/status`).send({ status: 'confirmed' })).status).toBe(401);
    expect((await patchStatus(staff.token, o.id, 'confirmed')).status).toBe(200);
    expect((await api().post(`/api/v1/admin/orders/${o.id}/cancel`).set(bearer(staff.token)).send({ reason: 'test' })).status).toBe(403);
    expect((await api().post(`/api/v1/admin/orders/${o.id}/return`).set(bearer(staff.token)).send({ restock: true })).status).toBe(403);
  });
  it('two admins racing the same step: one wins, the other gets a clear conflict', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin'); const o = await place(ids);
    const rs = await Promise.all([patchStatus(admin.token, o.id, 'confirmed'), patchStatus(admin.token, o.id, 'confirmed')]);
    const codes = rs.map((r) => r.status).sort();
    expect(codes[0]).toBe(200);
    expect([409, 422]).toContain(codes[1]); // the loser either hits the write conflict (409) or reads after the winner (422)
    expect((await Order.findById(o.id))!.statusHistory.filter((h) => h.status === 'confirmed')).toHaveLength(1);
  });
});

describe('cancel and return', () => {
  it('cancelling gives back stock, sold count and the coupon use — once', async () => {
    const ids = await shop(10); const admin = await makeAdmin('admin');
    const coupon = await Coupon.create({ code: 'SAVE50', type: 'fixed', value: 50, usageLimit: 5 });
    const o = await place(ids, { couponCode: 'SAVE50' });
    expect(await stock()).toBe(9);
    const rs = await Promise.all([1, 2].map(() => api().post(`/api/v1/admin/orders/${o.id}/cancel`).set(bearer(admin.token)).send({ reason: 'customer asked' })));
    const codes = rs.map((r) => r.status).sort();
    expect(codes[0]).toBe(200);
    expect([409, 422]).toContain(codes[1]);
    expect(await stock()).toBe(10);
    expect((await Coupon.findById(coupon._id))!.usedCount).toBe(0);
    expect(await CouponRedemption.countDocuments()).toBe(0);
    expect((await Product.findOne({ slug: 'hair-oil' }))!.soldCount).toBe(0);
    expect(await InventoryMovement.countDocuments({ order: o.id, reason: 'cancel' })).toBe(1);
    const c = (await Order.findById(o.id))!;
    expect(c).toMatchObject({ status: 'cancelled', paymentStatus: 'cancelled' });
    expect((await Payment.findOne({ order: o.id }))!.status).toBe('cancelled');
  });
  it('a paid order that is cancelled is flagged for refund (never silently lost)', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin'); const o = await place(ids);
    await Order.updateOne({ _id: o.id }, { $set: { paymentStatus: 'paid' } });
    await Payment.updateOne({ order: o.id }, { $set: { status: 'paid' } });
    const r = await api().post(`/api/v1/admin/orders/${o.id}/cancel`).set(bearer(admin.token)).send({ reason: 'out of stock' });
    expect(r.body.data.refundNeeded).toBe(true);
    expect((await Order.findById(o.id))!.paymentStatus).toBe('refund_pending');
    expect((await Payment.findOne({ order: o.id }))!.status).toBe('refund_pending');
  });
  it('cannot cancel once shipped; a return is used instead', async () => {
    const ids = await shop(10); const admin = await makeAdmin('admin'); const o = await place(ids);
    await patchStatus(admin.token, o.id, 'confirmed'); await patchStatus(admin.token, o.id, 'shipped');
    const r = await api().post(`/api/v1/admin/orders/${o.id}/cancel`).set(bearer(admin.token)).send({ reason: 'too late' });
    expect(r.status).toBe(422);
    expect(await stock()).toBe(9);
  });
  it('a return restocks only when the admin says the goods are sellable', async () => {
    const ids = await shop(10); const admin = await makeAdmin('admin');
    const a = await place(ids); const b = await place(ids);
    expect(await stock()).toBe(8);
    for (const o of [a, b]) await deliver(admin.token, o.id);
    expect((await api().post(`/api/v1/admin/orders/${a.id}/return`).set(bearer(admin.token)).send({ restock: true, note: 'unopened' })).status).toBe(200);
    expect(await stock()).toBe(9);
    expect((await api().post(`/api/v1/admin/orders/${b.id}/return`).set(bearer(admin.token)).send({ restock: false, note: 'opened' })).status).toBe(200);
    expect(await stock()).toBe(9);
    const ra = (await Order.findById(a.id))!;
    expect(ra).toMatchObject({ status: 'returned', paymentStatus: 'refund_pending' }); // cash was collected on delivery
    expect(ra.returnInfo).toMatchObject({ status: 'completed', restock: true });
    expect((await api().post(`/api/v1/admin/orders/${a.id}/return`).set(bearer(admin.token)).send({ restock: true })).status).toBe(422); // only once
    expect((await api().post(`/api/v1/admin/orders/${(await place(ids)).id}/return`).set(bearer(admin.token)).send({ restock: true })).status).toBe(422); // not shipped
  });
  it('restocks every part of a combo', async () => {
    const ids = await shop(10); const admin = await makeAdmin('admin');
    const o = await place(ids, { items: [{ productId: ids.combo, sku: 'COMBO-OIL-POWDER', qty: 2 }] });
    expect(await stock('wooden-comb')).toBe(8);
    await api().post(`/api/v1/admin/orders/${o.id}/cancel`).set(bearer(admin.token)).send({ reason: 'test' });
    expect([await stock('hair-oil'), await stock('hair-powder'), await stock('wooden-comb')]).toEqual([10, 10, 10]);
  });
});

describe('customer tracking and requests', () => {
  it('tracks by order number + phone and returns no address, email or full phone', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin');
    const o = await place(ids, {}, { email: 'karim@example.com' });
    await patchStatus(admin.token, o.id, 'confirmed', 'internal note secret');
    await api().patch(`/api/v1/admin/orders/${o.id}`).set(bearer(admin.token)).send({ courier: { name: 'Steadfast', trackingNo: 'TRK123' }, notes: 'internal only' });
    const r = await api().post('/api/v1/orders/track').send({ orderNo: o.orderNo, phone: o.phone });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ orderNo: o.orderNo, status: 'confirmed', courier: { name: 'Steadfast', trackingNo: 'TRK123' }, canCancel: true });
    expect(r.body.data.timeline.map((t: { status: string }) => t.status)).toEqual(['pending', 'confirmed']);
    const text = JSON.stringify(r.body);
    for (const secret of ['House 12', 'karim@example.com', o.phone, 'internal note secret', 'internal only', 'Mirpur']) expect(text).not.toContain(secret);
  });
  it('gives the same answer for a wrong order number and a wrong phone (no enumeration)', async () => {
    const ids = await shop(); const o = await place(ids);
    const wrongPhone = await api().post('/api/v1/orders/track').send({ orderNo: o.orderNo, phone: '01799999999' });
    const wrongOrder = await api().post('/api/v1/orders/track').send({ orderNo: 'HO-000000-AAAAA', phone: o.phone });
    expect(wrongPhone.status).toBe(404);
    expect(wrongOrder.status).toBe(404);
    expect(wrongPhone.body).toEqual(wrongOrder.body);
  });
  it('is rate limited to 5 lookups a minute', async () => {
    const app = createApp({ enforceRateLimits: true });
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await request(app).post('/api/v1/orders/track').send({ orderNo: 'HO-000000-AAAAA', phone: '01712345678' })).status);
    expect(codes.slice(0, 5)).toEqual([404, 404, 404, 404, 404]);
    expect(codes[5]).toBe(429);
  });
  it('customer cancel request: by phone or token, once; admin approves → cancelled and restocked; or declines', async () => {
    const ids = await shop(10); const admin = await makeAdmin('admin');
    const a = await place(ids); const b = await place(ids);
    const ask = (o: typeof a, body: object) => api().post(`/api/v1/orders/${o.orderNo}/cancel-request`).send({ reason: 'changed my mind', ...body });
    expect((await ask(a, { phone: '01799999999' })).status).toBe(404);
    expect((await ask(a, {})).status).toBe(400);
    expect((await ask(a, { phone: a.phone })).status).toBe(200);
    expect((await ask(a, { phone: a.phone })).status).toBe(409);
    expect((await ask(b, { token: b.token })).status).toBe(200);
    expect((await Order.findById(a.id))!.status).toBe('pending'); // a request does not cancel anything by itself
    expect((await api().post(`/api/v1/admin/orders/${a.id}/requests/cancellation`).set(bearer(admin.token)).send({ approve: true })).status).toBe(200);
    expect((await Order.findById(a.id))!).toMatchObject({ status: 'cancelled' });
    expect(await stock()).toBe(9);
    expect((await api().post(`/api/v1/admin/orders/${b.id}/requests/cancellation`).set(bearer(admin.token)).send({ approve: false, note: 'already packed' })).status).toBe(200);
    expect((await Order.findById(b.id))!).toMatchObject({ status: 'pending', cancellation: expect.objectContaining({ status: 'rejected' }) });
    await patchStatus(admin.token, b.id, 'confirmed'); await patchStatus(admin.token, b.id, 'shipped');
    expect((await ask(b, { phone: b.phone })).status).toBe(422); // too late
  });
  it('return requests: need a configured window, only after delivery and inside the window', async () => {
    const ids = await shop(10); const admin = await makeAdmin('admin'); const o = await place(ids);
    const ask = () => api().post(`/api/v1/orders/${o.orderNo}/return-request`).send({ phone: o.phone, reason: 'damaged bottle' });
    expect((await ask()).status).toBe(422); // not delivered
    await deliver(admin.token, o.id);
    expect((await ask()).status).toBe(422); // owner has not set a return window yet
    await WebsiteSettings.updateOne({ key: 'main' }, { $set: { 'orderSettings.returnWindowDays': 7 } });
    await Order.updateOne({ _id: o.id }, { $set: { deliveredAt: new Date(Date.now() - 10 * 86_400_000) } });
    expect((await ask()).body.error.message).toContain('7 days');
    await Order.updateOne({ _id: o.id }, { $set: { deliveredAt: new Date() } });
    expect((await api().post('/api/v1/orders/track').send({ orderNo: o.orderNo, phone: o.phone })).body.data.canReturn).toBe(true);
    expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(409);
    expect((await api().post(`/api/v1/admin/orders/${o.id}/requests/return`).set(bearer(admin.token)).send({ approve: true })).status).toBe(200);
    expect((await Order.findById(o.id))!.returnInfo!.status).toBe('approved');
  });
  it('lists a logged-in customer’s own orders only', async () => {
    const ids = await shop();
    const reg = await registerCustomer();
    const token = reg.body.data.accessToken as string;
    const mine = await place(ids, {}, { phone: '01712345678' }, bearer(token));
    await place(ids);
    const r = await api().get('/api/v1/orders/my').set(bearer(token));
    expect(r.body.data.items.map((i: { orderNo: string }) => i.orderNo)).toEqual([mine.orderNo]);
    expect((await api().get('/api/v1/orders/my')).status).toBe(401);
  });
});

describe('admin order tools', () => {
  it('edits notes, courier and (before shipping) the address; refuses unknown fields', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin'); const o = await place(ids);
    const patch = (b: object) => api().patch(`/api/v1/admin/orders/${o.id}`).set(bearer(admin.token)).send(b);
    expect((await patch({ notes: 'call first', courier: { name: 'Pathao', trackingNo: 'P-1' }, customer: { address: 'Flat 4B, Road 9, Dhanmondi' } })).status).toBe(200);
    expect((await Order.findById(o.id))!).toMatchObject({ notes: 'call first', courier: expect.objectContaining({ name: 'Pathao' }), customer: expect.objectContaining({ address: 'Flat 4B, Road 9, Dhanmondi' }) });
    expect((await patch({ total: 1 })).status).toBe(400);
    expect((await patch({ customer: { phone: '01700000000' } })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    await patchStatus(admin.token, o.id, 'confirmed'); await patchStatus(admin.token, o.id, 'shipped');
    expect((await patch({ customer: { address: 'Somewhere else entirely' } })).status).toBe(422);
    expect((await patch({ courier: { trackingNo: 'P-2' } })).status).toBe(200);
  });
  it('renders an escaped invoice for admins and a token-protected, address-free one for customers', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin');
    const o = await place(ids, {}, { name: '<script>alert(1)</script> Karim' });
    const a = await api().get(`/api/v1/admin/orders/${o.id}/invoice`).set(bearer(admin.token));
    expect(a.status).toBe(200);
    expect(a.headers['content-type']).toContain('text/html');
    expect(a.text).not.toContain('<script>alert');
    expect(a.text).toContain('&lt;script&gt;');
    expect(a.text).toContain(o.orderNo);
    expect(a.text).toContain('House 12');
    expect((await api().get(`/api/v1/admin/orders/${o.id}/invoice`)).status).toBe(401);
    expect((await api().get(`/api/v1/orders/${o.orderNo}/invoice`)).status).toBe(400);
    expect((await api().get(`/api/v1/orders/${o.orderNo}/invoice`).query({ token: 'x'.repeat(40) })).status).toBe(401);
    const c = await api().get(`/api/v1/orders/${o.orderNo}/invoice`).query({ token: o.token });
    expect(c.status).toBe(200);
    expect(c.text).not.toContain('House 12');
    expect(c.text).not.toContain(o.phone);
  });
  it('exports CSV for admins only, neutralising spreadsheet formulas', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin'); const staff = await makeAdmin('staff');
    await place(ids, {}, { name: '=HYPERLINK("http://evil","x")' });
    const r = await api().get('/api/v1/admin/orders/export').set(bearer(admin.token));
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.text).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(r.text.split('\r\n')).toHaveLength(2);
    expect((await api().get('/api/v1/admin/orders/export').set(bearer(staff.token))).status).toBe(403);
  });
  it('summarises what needs attention and saves order settings', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin');
    const a = await place(ids); await place(ids);
    await api().post(`/api/v1/orders/${a.orderNo}/cancel-request`).send({ phone: a.phone, reason: 'changed my mind' });
    const s = (await api().get('/api/v1/admin/orders/summary').set(bearer(admin.token))).body.data;
    expect(s).toMatchObject({ newOrders: 2, cancelRequests: 1, returnRequests: 0, manualPayments: 0, pendingReviews: 0 });
    const set = await api().patch('/api/v1/admin/settings/orders').set(bearer(admin.token)).send({ autoConfirm: true, returnWindowDays: 7 });
    expect(set.body.data).toEqual({ autoConfirm: true, returnWindowDays: 7 });
    expect((await api().patch('/api/v1/admin/settings/orders').set(bearer(admin.token)).send({ returnWindowDays: -1 })).status).toBe(400);
    expect((await api().patch('/api/v1/admin/settings/orders').set(bearer(admin.token)).send({ returnWindowDays: null })).body.data.returnWindowDays).toBeNull();
  });
});

describe('notifications', () => {
  it('queues messages for order events (email only when the customer gave one) and keeps them until a provider exists', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin');
    const o = await place(ids, {}, { email: 'karim@example.com' });
    await patchStatus(admin.token, o.id, 'confirmed');
    const rows = await Notification.find({ order: o.id }).sort({ createdAt: 1 });
    expect(rows.map((r) => `${r.template}:${r.channel}`)).toEqual(['order_placed:email', 'order_placed:sms', 'order_confirmed:email', 'order_confirmed:sms']);
    expect(rows.every((r) => r.status === 'queued')).toBe(true);
    expect(await processNotifications()).toMatchObject({ sent: 0, waiting: 4 });
  });
  it('sends through a registered provider, retries failures, then gives up after 3 tries', async () => {
    const ids = await shop();
    const sent: { to: string; subject: string; text: string }[] = [];
    registerEmailProvider({ send: async (m) => { sent.push(m); return { providerMessageId: 'm1' }; } });
    await place(ids, {}, { email: 'karim@example.com', name: 'Karim Hossain' });
    expect(await processNotifications()).toMatchObject({ sent: 1, waiting: 1 });
    expect(sent[0]).toMatchObject({ to: 'karim@example.com' });
    expect(sent[0]!.text).toContain('Hello Karim');
    expect(sent[0]!.text).toContain('WhatsApp');
    expect(await Notification.countDocuments({ status: 'sent' })).toBe(1);
    registerEmailProvider({ send: async () => { throw new Error('smtp down'); } });
    await place(ids, {}, { email: 'b@example.com' });
    for (let i = 0; i < 3; i++) await processNotifications();
    const failed = (await Notification.findOne({ to: 'b@example.com' }))!;
    expect(failed).toMatchObject({ status: 'failed', attempts: 3, lastError: 'smtp down' });
  });
});

describe('reviews', () => {
  async function delivered(ids: Ids, admin: { token: string }, over: Record<string, unknown> = {}) {
    const o = await place(ids, over); await deliver(admin.token, o.id); return o;
  }
  const review = (o: { orderNo: string; phone: string }, productId: string, extra: object = {}) => api().post('/api/v1/reviews').send({ orderNo: o.orderNo, phone: o.phone, productId, rating: 5, comment: 'Smells lovely and feels light.', ...extra });

  it('only verified buyers of a delivered order can review, and a review waits for approval', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin');
    const early = await place(ids);
    expect((await review(early, ids.oil)).status).toBe(422); // not delivered yet
    await deliver(admin.token, early.id);
    expect((await review({ orderNo: early.orderNo, phone: '01799999999' }, ids.oil)).status).toBe(404);
    expect((await review(early, ids.powder)).status).toBe(422); // not in this order
    expect((await review(early, ids.oil, { rating: 6 })).status).toBe(400);
    const ok = await review(early, ids.oil, { comment: 'Great <b>oil</b> <script>alert(1)</script>', title: '<i>Love it</i>' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.status).toBe('pending');
    expect((await review(early, ids.oil)).status).toBe(409);
    const list = async () => (await api().get('/api/v1/products/hair-oil/reviews')).body.data;
    expect((await list()).items).toHaveLength(0); // not public until approved
    const stored = (await Review.findOne())!;
    expect(stored.comment).not.toContain('<');
    expect(stored.isVerifiedPurchase).toBe(true);
    expect((await api().patch(`/api/v1/admin/reviews/${stored._id}`).set(bearer(admin.token)).send({ status: 'approved', adminReply: 'Thank you!' })).status).toBe(200);
    const pub = await list();
    expect(pub.items).toHaveLength(1);
    expect(pub.items[0]).toMatchObject({ name: 'Rahim U.', rating: 5, verified: true, reply: 'Thank you!' });
    expect(JSON.stringify(pub)).not.toContain(early.phone);
    expect(pub.summary).toMatchObject({ count: 1, average: 5 });
    expect((await Product.findOne({ slug: 'hair-oil' }))).toMatchObject({ ratingAverage: 5, ratingCount: 1 });
    expect((await api().get('/api/v1/reviews')).body.data.items).toHaveLength(1);
  });
  it('lets a combo buyer review its parts, keeps averages right after reject/delete, and limits who can delete', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin'); const staff = await makeAdmin('staff');
    const o1 = await delivered(ids, admin, { items: [{ productId: ids.combo, sku: 'COMBO-OIL-POWDER', qty: 1 }] });
    const o2 = await delivered(ids, admin);
    const r1 = await review(o1, ids.oil, { rating: 5 }); const r2 = await review(o2, ids.oil, { rating: 2, comment: 'Not for me, sorry.' });
    expect([r1.status, r2.status]).toEqual([201, 201]);
    for (const r of [r1, r2]) expect((await api().patch(`/api/v1/admin/reviews/${r.body.data.id}`).set(bearer(staff.token)).send({ status: 'approved' })).status).toBe(200);
    expect((await Product.findOne({ slug: 'hair-oil' }))).toMatchObject({ ratingAverage: 3.5, ratingCount: 2 });
    await api().patch(`/api/v1/admin/reviews/${r2.body.data.id}`).set(bearer(staff.token)).send({ status: 'rejected' });
    expect((await Product.findOne({ slug: 'hair-oil' }))).toMatchObject({ ratingAverage: 5, ratingCount: 1 });
    expect((await api().delete(`/api/v1/admin/reviews/${r1.body.data.id}`).set(bearer(staff.token))).status).toBe(403);
    expect((await api().delete(`/api/v1/admin/reviews/${r1.body.data.id}`).set(bearer(admin.token))).status).toBe(204);
    expect((await Product.findOne({ slug: 'hair-oil' }))).toMatchObject({ ratingAverage: 0, ratingCount: 0 });
    expect((await api().get('/api/v1/admin/reviews').query({ status: 'rejected' }).set(bearer(admin.token))).body.data.items).toHaveLength(1);
  });
});
