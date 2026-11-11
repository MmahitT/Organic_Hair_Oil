import crypto from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Coupon, CouponRedemption, InventoryMovement, Order, Payment, Product, WebsiteSettings } from './models/index.js';
import { runSeed } from './scripts/seed.js';
import { expireStaleOrders } from './services/payment.service.js';
import { clearDb, startTestDb, stopTestDb } from './test/db.js';
import { api, bearer, makeAdmin } from './test/helpers.js';

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(clearDb);

/* ---------- helpers ---------- */
type Ids = Record<'oil' | 'powder' | 'comb' | 'combo', string>;
async function shop(stock = 20): Promise<Ids> {
  await runSeed({ stock });
  await Product.updateMany({}, { $set: { visibility: 'published' } });
  const get = async (slug: string) => String((await Product.findOne({ slug }))!._id);
  return { oil: await get('hair-oil'), powder: await get('hair-powder'), comb: await get('wooden-comb'), combo: await get('combo-oil-powder-comb') };
}
let n = 0;
const body = (ids: Ids, over: Record<string, unknown> = {}) => ({
  idempotencyKey: crypto.randomUUID(), items: [{ productId: ids.oil, sku: 'HO-OIL-200', qty: 1 }],
  customer: { name: 'Rahim Uddin', phone: `0171${String(2000000 + n++).slice(-7)}`, district: 'Rangpur', city: 'Mirpur', address: 'House 12, Road 5, Mirpur DOHS' },
  paymentMethod: 'manual_bkash', ...over,
});
const checkout = (b: object) => api().post('/api/v1/checkout').send(b);
const stock = async (slug = 'hair-oil') => (await Product.findOne({ slug }))!.variants[0]!.stock;
const enableManual = () => WebsiteSettings.updateOne({ key: 'main' }, { $set: { 'payments.manual': { enabled: true, bkash: '01711111111', nagad: null, rocket: null } } });

describe('no payment gateway', () => {
  it('has no gateway routes, no online option and refuses an "sslcommerz" order', async () => {
    const ids = await shop();
    expect((await api().post('/api/v1/payments/sslcommerz/ipn').send({})).status).toBe(404);
    expect((await api().post('/api/v1/payments/sslcommerz/init').send({})).status).toBe(404);
    expect((await checkout(body(ids, { paymentMethod: 'sslcommerz' }))).status).toBe(400);
    const pm = (await api().get('/api/v1/settings/public')).body.data.payments;
    expect(Object.keys(pm).sort()).toEqual(['bank', 'cod', 'manual']);
    const admin = await makeAdmin('admin');
    expect(JSON.stringify((await api().get('/api/v1/admin/settings/payments').set(bearer(admin.token))).body)).not.toMatch(/sslcommerz|gateway/i);
  });
});

describe('holding and releasing stock for unpaid prepaid orders', () => {
  const place = async (ids: Ids, over: Record<string, unknown> = {}) => {
    const res = await checkout(body(ids, over));
    expect(res.status).toBe(201);
    return (await Order.findOne({ orderNo: res.body.data.orderNo }))!;
  };
  const expire = (id: unknown) => Order.updateOne({ _id: id }, { $set: { reservationExpiresAt: new Date(Date.now() - 1000) } });

  it('holds stock while waiting for payment, then gives stock, coupon use and sold count back exactly once', async () => {
    const ids = await shop(10); await enableManual();
    const coupon = await Coupon.create({ code: 'SAVE50', type: 'fixed', value: 50, usageLimit: 5 });
    const order = await place(ids, { couponCode: 'SAVE50' });
    expect(order.reservationExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(await stock()).toBe(9);
    expect((await Coupon.findById(coupon._id))!.usedCount).toBe(1);
    await expire(order._id);
    expect(await expireStaleOrders()).toEqual({ released: 1 });
    expect(await expireStaleOrders()).toEqual({ released: 0 });
    expect((await Order.findById(order._id))!).toMatchObject({ status: 'cancelled', paymentStatus: 'expired' });
    expect(await stock()).toBe(10);
    expect((await Coupon.findById(coupon._id))!.usedCount).toBe(0);
    expect(await CouponRedemption.countDocuments()).toBe(0);
    expect((await Product.findOne({ slug: 'hair-oil' }))!.soldCount).toBe(0);
    expect(await InventoryMovement.countDocuments({ order: order._id, reason: 'cancel' })).toBe(1);
    expect((await Payment.findOne({ order: order._id }))!.status).toBe('expired');
  });
  it('restores every part of a combo order', async () => {
    const ids = await shop(10); await enableManual();
    const order = await place(ids, { items: [{ productId: ids.combo, sku: 'COMBO-OIL-POWDER', qty: 2 }] });
    expect(await stock('wooden-comb')).toBe(8);
    await expire(order._id); await expireStaleOrders();
    expect([await stock('hair-oil'), await stock('hair-powder'), await stock('wooden-comb')]).toEqual([10, 10, 10]);
  });
  it('never expires an order whose customer has submitted a claim (the owner is checking it), nor a COD order', async () => {
    const ids = await shop(10); await enableManual();
    const waiting = await place(ids);
    const claimRes = await checkout(body(ids));
    await api().post('/api/v1/payments/manual/submit').send({ orderNo: claimRes.body.data.orderNo, token: claimRes.body.data.orderToken, trxId: 'CLAIM12345', senderNumber: '01722222222' });
    const claimed = (await Order.findOne({ orderNo: claimRes.body.data.orderNo }))!;
    const cod = await place(ids, { paymentMethod: 'cod' });
    for (const o of [waiting, claimed, cod]) await expire(o._id); // sets a past deadline (the claimed/COD ones had none)
    expect(await expireStaleOrders()).toEqual({ released: 1 }); // only the unclaimed prepaid order
    expect((await Order.findById(waiting._id))!.status).toBe('cancelled');
    expect((await Order.findById(claimed._id))!.status).toBe('pending');
    expect((await Order.findById(cod._id))!.status).toBe('pending');
  });
  it('30 simultaneous prepaid orders for 10 units reserve exactly 10, and expiry returns all of them', async () => {
    const ids = await shop(10); await enableManual();
    const results = await Promise.all(Array.from({ length: 30 }, () => checkout(body(ids))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(10);
    expect(await stock()).toBe(0);
    await Order.updateMany({}, { $set: { reservationExpiresAt: new Date(Date.now() - 1000) } });
    expect(await expireStaleOrders()).toEqual({ released: 10 });
    expect(await stock()).toBe(10);
  });
});

describe('manual bKash / Nagad / Rocket', () => {
  const enableManual = () => WebsiteSettings.updateOne({ key: 'main' }, { $set: { 'payments.manual': { enabled: true, bkash: '01711111111', nagad: null, rocket: null } } });
  it('is off by default and only offers channels that have a number', async () => {
    const ids = await shop();
    expect((await checkout(body(ids, { paymentMethod: 'manual_bkash' }))).body.error.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
    await enableManual();
    expect((await checkout(body(ids, { paymentMethod: 'manual_nagad' }))).body.error.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
    expect((await api().get('/api/v1/settings/public')).body.data.payments).toEqual({ cod: true, manual: [{ channel: 'bkash', number: '01711111111', instructions: null }], bank: null });
  });
  it('stays pending until an admin approves; a reused transaction id is refused', async () => {
    const ids = await shop(10);
    await enableManual();
    const a = await checkout(body(ids, { paymentMethod: 'manual_bkash' }));
    expect(a.status).toBe(201);
    const { orderNo, orderToken } = a.body.data;
    const view = await api().get(`/api/v1/orders/${orderNo}/status`).query({ token: orderToken });
    expect(view.body.data.payment.manual).toMatchObject({ channel: 'bkash', number: '01711111111', canSubmit: true, submitted: false });

    const submit = (no: string, tok: string, trxId: string) => api().post('/api/v1/payments/manual/submit').send({ orderNo: no, token: tok, trxId, senderNumber: '01722222222' });
    expect((await submit(orderNo, 'x'.repeat(40), 'ABC123XYZ9')).status).toBe(401);
    expect((await submit(orderNo, orderToken, 'ab')).status).toBe(400);
    expect((await submit(orderNo, orderToken, 'abc123xyz9')).status).toBe(200);
    const order = (await Order.findOne({ orderNo }))!;
    expect(order).toMatchObject({ paymentStatus: 'pending', status: 'pending' });
    expect(order.reservationExpiresAt).toBeUndefined();
    expect(await expireStaleOrders()).toMatchObject({ released: 0 }); // not cancelled while the owner verifies

    const b = await checkout(body(ids, { paymentMethod: 'manual_bkash' }));
    const dup = await submit(b.body.data.orderNo, b.body.data.orderToken, 'ABC123XYZ9');
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('TRX_ALREADY_USED');

    const admin = await makeAdmin('admin');
    const pay = (await Payment.findOne({ order: order._id }))!;
    const ok = await api().post(`/api/v1/admin/payments/${pay._id}/resolve`).set(bearer(admin.token)).send({ approve: true, note: 'seen in bKash app' });
    expect(ok.status).toBe(200);
    expect((await Order.findById(order._id))!.paymentStatus).toBe('paid');
    expect((await Payment.findById(pay._id))!).toMatchObject({ status: 'paid', manual: expect.objectContaining({ trxId: 'ABC123XYZ9' }) });
    expect((await api().post(`/api/v1/admin/payments/${pay._id}/resolve`).set(bearer(admin.token)).send({ approve: true })).status).toBe(422);
  });
  it('a rejected reference lets the customer try again', async () => {
    const ids = await shop(10);
    await enableManual();
    const a = await checkout(body(ids, { paymentMethod: 'manual_bkash' }));
    const { orderNo, orderToken } = a.body.data;
    await api().post('/api/v1/payments/manual/submit').send({ orderNo, token: orderToken, trxId: 'WRONG12345', senderNumber: '01722222222' });
    const admin = await makeAdmin('admin');
    const pay = (await Payment.findOne({ tranId: `${orderNo}-MANUAL` }))!;
    const rej = await api().post(`/api/v1/admin/payments/${pay._id}/resolve`).set(bearer(admin.token)).send({ approve: false, note: 'no such payment' });
    expect(rej.body.data.status).toBe('failed');
    expect((await Order.findOne({ orderNo }))!.paymentStatus).toBe('failed');
    const again = await api().post('/api/v1/payments/manual/submit').send({ orderNo, token: orderToken, trxId: 'RIGHT123456', senderNumber: '01722222222' });
    expect(again.status).toBe(200);
    expect((await Payment.findById(pay._id))!.status).toBe('pending');
  });
});

describe('bank transfer, payment details and the “never paid on a claim” rule', () => {
  const settings = (token: string, body: object) => api().patch('/api/v1/admin/settings/payments').set(bearer(token)).send(body);
  const BANK = { enabled: true, bankName: 'Example Bank', accountName: 'Test Business', accountNumber: '1234-567-890', branch: 'Dhanmondi', instructions: 'Use the order number as the transfer reference.' };

  it('keeps bank transfer off until every detail customers need is filled in; validates input', async () => {
    await shop(); const admin = await makeAdmin('admin');
    const ids = await shop();
    expect((await checkout(body(ids, { paymentMethod: 'manual_bank' }))).body.error.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
    const half = await settings(admin.token, { bank: { enabled: true, bankName: 'Example Bank' } });
    expect(half.status).toBe(422);
    expect((await api().get('/api/v1/admin/settings/payments').set(bearer(admin.token))).body.data.bank.enabled).toBe(false); // rolled back
    expect((await settings(admin.token, { bank: { accountNumber: 'DROP TABLE;' } })).status).toBe(400);
    expect((await settings(admin.token, { manual: { bkash: '12345' } })).status).toBe(400);
    expect((await settings(admin.token, { bank: { ...BANK, surprise: 1 } })).status).toBe(400);
    expect((await settings(admin.token, { bank: BANK })).body.data.bank).toMatchObject(BANK);
  });
  it('shows the owner’s instructions and account details at checkout, from the database only', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin');
    await settings(admin.token, { bank: BANK, manual: { enabled: true, bkash: '01711111111', instructions: { bkash: 'Send Money (not Cash Out) to this number.' } } });
    const pm = (await api().get('/api/v1/settings/public')).body.data.payments;
    expect(pm.bank).toEqual({ bankName: 'Example Bank', accountName: 'Test Business', accountNumber: '1234-567-890', branch: 'Dhanmondi', instructions: BANK.instructions });
    expect(pm.manual).toEqual([{ channel: 'bkash', number: '01711111111', instructions: 'Send Money (not Cash Out) to this number.' }]);
    expect((await api().get('/api/v1/delivery/zones')).body.data.methods.bank.accountNumber).toBe('1234-567-890');
    await settings(admin.token, { bank: { enabled: false } });
    expect((await api().get('/api/v1/settings/public')).body.data.payments.bank).toBeNull(); // switched off → no details shown
    void ids;
  });
  it('a submitted transaction ID or reference never marks anything paid; only an admin can', async () => {
    const ids = await shop(10); const admin = await makeAdmin('admin');
    await settings(admin.token, { bank: BANK });
    const a = await checkout(body(ids, { paymentMethod: 'manual_bank' }));
    expect(a.status).toBe(201);
    const { orderNo, orderToken } = a.body.data;
    const view = await api().get(`/api/v1/orders/${orderNo}/status`).query({ token: orderToken });
    expect(view.body.data.payment.manual).toMatchObject({ channel: 'bank', number: null, canSubmit: true, bank: { accountNumber: '1234-567-890' }, instructions: BANK.instructions });
    const submit = (b: object) => api().post('/api/v1/payments/manual/submit').send({ orderNo, token: orderToken, ...b });
    expect((await submit({ trxId: 'ab' })).status).toBe(400);
    expect((await submit({ trxId: 'TRF-2026-0042', senderName: 'Karim Hossain', reference: 'Paid from City Bank ac ending 4411' })).status).toBe(200);
    const order = (await Order.findOne({ orderNo }))!;
    const pay = (await Payment.findOne({ order: order._id }).select('+gatewayResponse'))!;
    expect(order.paymentStatus).toBe('pending');
    expect(pay).toMatchObject({ provider: 'manual', method: 'bank', status: 'pending' });
    expect(pay.manual).toMatchObject({ trxId: 'TRF-2026-0042', senderName: 'Karim Hossain', reference: 'Paid from City Bank ac ending 4411' });
    // …and an unverified order cannot be processed
    const step = await api().patch(`/api/v1/admin/orders/${order._id}/status`).set(bearer(admin.token)).send({ status: 'confirmed' });
    expect(step.body.error.code).toBe('PAYMENT_REQUIRED');
    // the customer can resubmit while waiting, but it is still not paid
    expect((await submit({ trxId: 'TRF-2026-0043' })).status).toBe(200);
    expect((await Order.findOne({ orderNo }))!.paymentStatus).toBe('pending');
    // admin verifies against the real bank statement
    const ok = await api().post(`/api/v1/admin/payments/${pay._id}/resolve`).set(bearer(admin.token)).send({ approve: true, note: 'seen in statement 12 Nov' });
    expect(ok.status).toBe(200);
    expect((await Order.findOne({ orderNo }))!.paymentStatus).toBe('paid');
    const hist = (await Payment.findById(pay._id))!.events;
    expect(hist.map((e) => e.type)).toEqual(['order_placed', 'manual_submitted', 'manual_submitted', 'verified']);
    expect(hist.every((e) => e.at instanceof Date)).toBe(true);
    expect(hist.at(-1)).toMatchObject({ by: expect.stringContaining('admin user'), note: 'seen in statement 12 Nov' });
  });
  it('mobile-money payments still need the sender number', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin');
    await settings(admin.token, { manual: { enabled: true, bkash: '01711111111' } });
    const a = await checkout(body(ids, { paymentMethod: 'manual_bkash' }));
    const r = await api().post('/api/v1/payments/manual/submit').send({ orderNo: a.body.data.orderNo, token: a.body.data.orderToken, trxId: '8N7A6D5E4C' });
    expect(r.status).toBe(400);
  });
  it('records refunds the owner already sent: partial then full, never more than was paid, admin only', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin'); const staff = await makeAdmin('staff');
    await settings(admin.token, { bank: BANK });
    const a = await checkout(body(ids, { paymentMethod: 'manual_bank' }));
    const order = (await Order.findOne({ orderNo: a.body.data.orderNo }))!;
    const pay = (await Payment.findOne({ order: order._id }))!;
    const refund = (b: object, t = admin.token) => api().post(`/api/v1/admin/payments/${pay._id}/refund`).set(bearer(t)).send(b);
    expect((await refund({ reason: 'not paid yet' })).status).toBe(422); // nothing to refund before verification
    await api().post('/api/v1/payments/manual/submit').send({ orderNo: order.orderNo, token: a.body.data.orderToken, trxId: 'TRF000111' });
    await api().post(`/api/v1/admin/payments/${pay._id}/resolve`).set(bearer(admin.token)).send({ approve: true });
    expect((await refund({ amount: 100, reason: 'x' }, staff.token)).status).toBe(403);
    expect((await refund({ amount: 100 })).status).toBe(400); // reason required
    const first = await refund({ amount: 100, reason: 'partial: one item damaged' });
    expect(first.body.data).toEqual({ status: 'partially_refunded', refundedTotal: 100 });
    expect((await Order.findById(order._id))!.paymentStatus).toBe('partially_refunded');
    expect((await refund({ amount: 611, reason: 'too much' })).status).toBe(422);
    const rest = await Promise.all([refund({ reason: 'rest A' }), refund({ reason: 'rest B' })]); // two admins at once
    expect(rest.map((r) => r.status).sort()).toEqual([200, rest.some((r) => r.status === 409) ? 409 : 422]);
    const done = (await Payment.findById(pay._id))!;
    expect(done).toMatchObject({ status: 'refunded', refundedTotal: 610 });
    expect(done.refunds.map((r) => r.amount).reduce((x, y) => x + y, 0)).toBe(610);
    expect((await Order.findById(order._id))!.paymentStatus).toBe('refunded');
    expect(done.events.some((e) => e.type === 'refund_recorded' && e.by?.includes('admin user'))).toBe(true);
    expect((await refund({ reason: 'again' })).status).toBe(422);
  });
  it('keeps cash-on-delivery orders apart from prepaid ones in the admin order list', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin');
    await settings(admin.token, { bank: BANK });
    await checkout(body(ids, { paymentMethod: 'cod' }));
    await checkout(body(ids, { paymentMethod: 'manual_bank' }));
    const list = async (payType: string) => (await api().get('/api/v1/admin/orders').query({ payType }).set(bearer(admin.token))).body.data.items.map((o: { paymentMethod: string }) => o.paymentMethod);
    expect(await list('cod')).toEqual(['cod']);
    expect(await list('prepaid')).toEqual(['manual_bank']);
    expect((await api().get('/api/v1/admin/orders').query({ payType: 'nope' }).set(bearer(admin.token))).status).toBe(400);
  });
  it('protects payment settings, payments and refunds behind admin login', async () => {
    await shop(); const staff = await makeAdmin('staff');
    for (const [method, path] of [['get', '/api/v1/admin/settings/payments'], ['patch', '/api/v1/admin/settings/payments'], ['get', '/api/v1/admin/payments'], ['post', '/api/v1/admin/payments/aaaaaaaaaaaaaaaaaaaaaaaa/refund']] as const) {
      expect((await api()[method](path).send({})).status).toBe(401);
      expect((await api()[method](path).set(bearer(staff.token)).send({})).status).toBe(403);
    }
  });
});

describe('admin payments', () => {
  it('requires an admin; lists, filters and shows details; rejects settings that would break checkout', async () => {
    const ids = await shop(); await enableManual();
    const a = await checkout(body(ids));
    expect((await api().get('/api/v1/admin/payments')).status).toBe(401);
    const staff = await makeAdmin('staff');
    expect((await api().get('/api/v1/admin/payments').set(bearer(staff.token))).status).toBe(403);
    const admin = await makeAdmin('admin');
    const list = await api().get('/api/v1/admin/payments').query({ provider: 'manual' }).set(bearer(admin.token));
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].order.orderNo).toBe(a.body.data.orderNo);
    expect((await api().get(`/api/v1/admin/payments/${list.body.data.items[0]._id}`).set(bearer(admin.token))).status).toBe(200);
    expect((await api().get('/api/v1/admin/payments').query({ provider: 'sslcommerz' }).set(bearer(admin.token))).status).toBe(400);
    const patch = (b: object) => api().patch('/api/v1/admin/settings/payments').set(bearer(admin.token)).send(b);
    expect((await patch({})).status).toBe(400);
    expect((await patch({ sslcommerzEnabled: true })).status).toBe(400); // the option no longer exists
    await WebsiteSettings.updateOne({ key: 'main' }, { $set: { 'payments.manual': { enabled: false, bkash: null, nagad: null, rocket: null } } });
    expect((await patch({ manual: { enabled: true } })).status).toBe(422); // no number to show customers
    expect((await patch({ manual: { bkash: '01711111111', enabled: true } })).body.data.manual).toMatchObject({ enabled: true, bkash: '01711111111' });
  });
});
