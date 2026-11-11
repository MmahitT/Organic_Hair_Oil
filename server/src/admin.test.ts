import crypto from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { AuditLog, ContactMessage, Customer, Order, Product, User, WebsiteSettings } from './models/index.js';
import { runSeed } from './scripts/seed.js';
import { clearDb, startTestDb, stopTestDb } from './test/db.js';
import { api, bearer, makeAdmin, registerCustomer } from './test/helpers.js';

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
const phone = () => `0171${String(4000000 + n++).slice(-7)}`;
async function place(ids: Ids, over: Record<string, unknown> = {}, who: { phone?: string; name?: string; district?: string } = {}) {
  const res = await api().post('/api/v1/checkout').send({
    idempotencyKey: crypto.randomUUID(), items: [{ productId: ids.oil, sku: 'HO-OIL-200', qty: 1 }],
    customer: { name: who.name ?? 'Rahim Uddin', phone: who.phone ?? phone(), district: who.district ?? 'Rangpur', city: 'Mirpur', address: 'House 12, Road 5, Mirpur DOHS' },
    paymentMethod: 'cod', allowDuplicate: true, ...over, // allowDuplicate: tests place several identical orders on purpose
  });
  return res;
}
const orderOf = async (res: { body: { data: { orderNo: string } } }) => (await Order.findOne({ orderNo: res.body.data.orderNo }))!;
const setStatus = (token: string, id: unknown, status: string) => api().patch(`/api/v1/admin/orders/${id}/status`).set(bearer(token)).send({ status });

describe('dashboard', () => {
  it('counts only confirmed-or-later orders as revenue and splits COD from prepaid', async () => {
    const ids = await shop(30); const admin = await makeAdmin('admin');
    await WebsiteSettings.updateOne({ key: 'main' }, { $set: { 'payments.bank': { enabled: true, bankName: 'B', accountName: 'A', accountNumber: '123456' } } });
    const a = await orderOf(await place(ids));                                  // COD → delivered   (610)
    const b = await orderOf(await place(ids));                                  // COD → stays pending (not revenue)
    const c = await orderOf(await place(ids));                                  // COD → cancelled     (not revenue)
    const d = await orderOf(await place(ids, { paymentMethod: 'manual_bank', items: [{ productId: ids.powder, sku: 'HO-PWD-225', qty: 2 }] })); // prepaid → verified+confirmed (1000+120? Dhaka 60)
    for (const s of ['confirmed', 'shipped', 'delivered']) await setStatus(admin.token, a._id, s);
    await api().post(`/api/v1/admin/orders/${c._id}/cancel`).set(bearer(admin.token)).send({ reason: 'test' });
    await api().post('/api/v1/payments/manual/submit').send({ orderNo: d.orderNo, token: (await api().post('/api/v1/orders/track').send({ orderNo: d.orderNo, phone: d.customer!.phone })).body.data.token, trxId: 'TRF000999' });
    const pay = (await (await import('./models/index.js')).Payment.findOne({ order: d._id }))!;
    await api().post(`/api/v1/admin/payments/${pay._id}/resolve`).set(bearer(admin.token)).send({ approve: true });
    await setStatus(admin.token, d._id, 'confirmed');
    void b;
    const s = (await api().get('/api/v1/admin/dashboard/summary').set(bearer(admin.token))).body.data;
    expect(s.revenue).toBe(610 + 1060);
    expect(s.revenueOrders).toBe(2);
    expect(s.averageOrderValue).toBe(Math.round(1670 / 2));
    expect(s.ordersByStatus).toMatchObject({ pending: 1, confirmed: 1, delivered: 1, cancelled: 1 });
    expect(s.ordersPlaced).toBe(4);
    expect(s.pendingOrders).toBe(1);
    expect(s.completedOrders).toBe(1);
    expect(s.paymentSplit).toEqual({ cod: { revenue: 610, orders: 1 }, prepaid: { revenue: 1060, orders: 1 } });
    expect(s.definition).toMatch(/confirmed/);
  });
  it('separates new from returning customers', async () => {
    const ids = await shop(30); const admin = await makeAdmin('admin');
    const ph = phone();
    await place(ids, {}, { phone: ph }); await place(ids, {}, { phone: ph }); await place(ids);
    const old = await orderOf(await place(ids, {}, { phone: '01788888888' }));
    await Order.collection.updateOne({ _id: old._id }, { $set: { createdAt: new Date(Date.now() - 90 * 86_400_000) } });
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    expect((await api().get('/api/v1/admin/dashboard/summary').query({ from }).set(bearer(admin.token))).body.data.customers).toEqual({ newCustomers: 2, returningCustomers: 0 });
    await place(ids, {}, { phone: '01788888888' }); // that customer came back
    expect((await api().get('/api/v1/admin/dashboard/summary').query({ from }).set(bearer(admin.token))).body.data.customers).toEqual({ newCustomers: 2, returningCustomers: 1 });
  });
  it('charts one point per Bangladesh day (UTC+6) and fills quiet days with zero', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin');
    const o = await orderOf(await place(ids));
    for (const s of ['confirmed']) await setStatus(admin.token, o._id, s);
    await Order.collection.updateOne({ _id: o._id }, { $set: { createdAt: new Date('2026-11-10T19:00:00Z') } }); // 01:00 on 11 Nov in Dhaka
    const r = await api().get('/api/v1/admin/dashboard/sales-chart').query({ from: '2026-11-09', to: '2026-11-12' }).set(bearer(admin.token));
    expect(r.body.data.points).toEqual([
      { date: '2026-11-09', revenue: 0, orders: 0 }, { date: '2026-11-10', revenue: 0, orders: 0 },
      { date: '2026-11-11', revenue: 610, orders: 1 }, { date: '2026-11-12', revenue: 0, orders: 0 },
    ]);
  });
  it('lists best sellers, recent orders and low stock; validates the range; keeps staff out', async () => {
    const ids = await shop(30); const admin = await makeAdmin('admin'); const staff = await makeAdmin('staff');
    for (let i = 0; i < 3; i++) { const o = await orderOf(await place(ids)); await setStatus(admin.token, o._id, 'confirmed'); }
    const p = await orderOf(await place(ids, { items: [{ productId: ids.comb, sku: 'HO-COMB', qty: 1 }] })); await setStatus(admin.token, p._id, 'confirmed');
    const best = (await api().get('/api/v1/admin/dashboard/best-sellers').set(bearer(admin.token))).body.data.items;
    expect(best.map((b: { name: string; quantity: number }) => [b.name, b.quantity])).toEqual([['Hair Oil', 3], ['Wooden Comb', 1]]);
    const recent = (await api().get('/api/v1/admin/dashboard/recent-orders').set(bearer(admin.token))).body.data.items;
    expect(recent).toHaveLength(4);
    expect(recent[0].orderNo).toBe(p.orderNo);
    await api().patch(`/api/v1/admin/inventory/${ids.powder}/HO-PWD-225`).set(bearer(admin.token)).send({ set: 2, note: 'count' });
    const low = (await api().get('/api/v1/admin/dashboard/low-stock').set(bearer(admin.token))).body.data.items;
    expect(low.map((l: { sku: string; stock: number }) => [l.sku, l.stock])).toEqual([['HO-PWD-225', 2]]);
    expect((await api().get('/api/v1/admin/dashboard/summary').query({ from: '2026-11-12', to: '2026-11-01' }).set(bearer(admin.token))).status).toBe(400);
    expect((await api().get('/api/v1/admin/dashboard/summary').query({ from: '2020-01-01', to: '2026-11-01' }).set(bearer(admin.token))).status).toBe(400);
    expect((await api().get('/api/v1/admin/dashboard/summary').query({ from: 'yesterday' }).set(bearer(admin.token))).status).toBe(400);
    for (const path of ['summary', 'sales-chart', 'best-sellers', 'recent-orders', 'low-stock']) {
      expect((await api().get(`/api/v1/admin/dashboard/${path}`)).status).toBe(401);
      expect((await api().get(`/api/v1/admin/dashboard/${path}`).set(bearer(staff.token))).status).toBe(403);
    }
  });
});

describe('customers', () => {
  it('derives customers from orders, with totals, search, sorting and detail', async () => {
    const ids = await shop(40); const admin = await makeAdmin('admin');
    const a = '01711111111', b = '01722222222';
    for (let i = 0; i < 3; i++) { const o = await orderOf(await place(ids, {}, { phone: a, name: 'Karim Hossain' })); await setStatus(admin.token, o._id, 'confirmed'); }
    await place(ids, {}, { phone: b, name: 'Salma Akter', district: 'Sylhet' });
    const list = (q: object) => api().get('/api/v1/admin/customers').query(q).set(bearer(admin.token));
    const all = (await list({})).body;
    expect(all.meta.total).toBe(2);
    expect(all.data.items[0]).toMatchObject({ phone: b }); // most recent first
    const bySpend = (await list({ sort: 'spent' })).body.data.items;
    expect(bySpend[0]).toMatchObject({ phone: a, name: 'Karim Hossain', orders: 3, spent: 1830, returning: true, isBlocked: false });
    expect(bySpend[1]).toMatchObject({ phone: b, orders: 1, spent: 0, returning: false }); // pending order is not revenue
    expect((await list({ q: 'salma' })).body.data.items.map((c: { phone: string }) => c.phone)).toEqual([b]);
    expect((await list({ q: '01711111111' })).body.data.items.map((c: { phone: string }) => c.phone)).toEqual([a]);
    expect((await list({ q: '.*' })).body.data.items).toHaveLength(0); // regex characters are escaped
    const d = (await api().get(`/api/v1/admin/customers/${a}`).set(bearer(admin.token))).body.data.customer;
    expect(d).toMatchObject({ name: 'Karim Hossain', orders: 3, spent: 1830, notes: '' });
    expect(d.recentOrders).toHaveLength(3);
    expect(d.addresses[0]).toMatchObject({ district: 'Rangpur' });
    expect((await api().get('/api/v1/admin/customers/01799999999').set(bearer(admin.token))).status).toBe(404);
    expect((await api().get('/api/v1/admin/customers/notaphone').set(bearer(admin.token))).status).toBe(400);
  });
  it('lets the owner keep notes and block a customer — blocked customers cannot order or sign in', async () => {
    const ids = await shop(40); const admin = await makeAdmin('admin');
    const ph = '01733333333';
    await place(ids, {}, { phone: ph });
    const patch = (b: object) => api().patch(`/api/v1/admin/customers/${ph}`).set(bearer(admin.token)).send(b);
    expect((await patch({ notes: 'Calls late; prefers evening delivery.' })).body.data.customer.notes).toContain('evening');
    expect((await patch({})).status).toBe(400);
    expect((await patch({ isBlocked: true, extra: 1 })).status).toBe(400);
    expect((await patch({ isBlocked: true })).body.data.customer.isBlocked).toBe(true);
    const blocked = await place(ids, {}, { phone: ph });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('ACCOUNT_BLOCKED');
    expect((await api().get('/api/v1/admin/customers').query({ blocked: 'true' }).set(bearer(admin.token))).body.data.items).toHaveLength(1);
    expect((await api().get('/api/v1/admin/customers').query({ blocked: 'false' }).set(bearer(admin.token))).body.data.items).toHaveLength(0);
    expect((await patch({ isBlocked: false })).body.data.customer.isBlocked).toBe(false);
    expect((await place(ids, {}, { phone: ph })).status).toBe(201);
    expect((await AuditLog.find({ entityType: 'Customer' })).map((a) => a.action).sort()).toEqual(['customer.block', 'customer.notes', 'customer.unblock']);
  });
  it('blocking also blocks a registered account', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin');
    await registerCustomer();
    await place(ids, {}, { phone: '01712345678' });
    await api().patch('/api/v1/admin/customers/01712345678').set(bearer(admin.token)).send({ isBlocked: true });
    expect((await User.findOne({ phone: '01712345678' }))!.isBlocked).toBe(true);
    expect((await api().post('/api/v1/auth/login').send({ identifier: '01712345678', password: 'Correct-Horse-9' })).status).toBe(401);
    expect(await Customer.countDocuments({ phone: '01712345678', isBlocked: true })).toBe(1);
  });
  it('exports customers for admins only, logs it, and neutralises spreadsheet formulas', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin'); const staff = await makeAdmin('staff');
    await place(ids, {}, { name: '=cmd|"/c calc"!A1' });
    const r = await api().get('/api/v1/admin/customers/export').set(bearer(admin.token));
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.text).toContain(`'=cmd|`);
    expect(await AuditLog.countDocuments({ action: 'customer.export' })).toBe(1);
    for (const path of ['/api/v1/admin/customers', '/api/v1/admin/customers/export', '/api/v1/admin/customers/01711111111']) {
      expect((await api().get(path)).status).toBe(401);
      expect((await api().get(path).set(bearer(staff.token))).status).toBe(403);
    }
  });
});

describe('contact messages', () => {
  const send = (b: object) => api().post('/api/v1/contact').send(b);
  it('stores real messages, silently drops bot submissions, and validates', async () => {
    await shop();
    expect((await send({ name: 'Rahim', phone: '01712345678', message: 'Is the oil safe for kids?' })).status).toBe(201);
    expect((await send({ name: 'Bot', email: 'b@example.com', message: 'buy cheap pills now', website: 'http://spam.example' })).status).toBe(201);
    expect(await ContactMessage.countDocuments()).toBe(1); // the honeypot one was discarded
    expect((await send({ name: 'R', phone: '01712345678', message: 'hello there' })).status).toBe(400);
    expect((await send({ name: 'Rahim', message: 'no way to reply' })).status).toBe(400);
    expect((await send({ name: 'Rahim', phone: '12', message: 'bad phone number' })).status).toBe(400);
    expect((await send({ name: 'Rahim', email: '', phone: '01712345678', message: 'x'.repeat(1501) })).status).toBe(400);
  });
  it('is rate limited to 3 messages a minute', async () => {
    const app = createApp({ enforceRateLimits: true });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await request(app).post('/api/v1/contact').send({ name: 'Rahim', phone: '01712345678', message: `hello number ${i}` })).status);
    expect(codes).toEqual([201, 201, 201, 429, 429]);
  });
  it('shows messages to admins, lets them mark progress, and counts new ones for the badge', async () => {
    const admin = await makeAdmin('admin'); const staff = await makeAdmin('staff');
    await send({ name: 'Rahim', phone: '01712345678', message: 'Please call me back' });
    expect((await api().get('/api/v1/admin/messages')).status).toBe(401);
    expect((await api().get('/api/v1/admin/messages').set(bearer(staff.token))).status).toBe(403);
    const list = (await api().get('/api/v1/admin/messages').query({ status: 'new' }).set(bearer(admin.token))).body.data.items;
    expect(list).toHaveLength(1);
    expect(list[0].ipHash).toBeUndefined();
    expect((await api().get('/api/v1/admin/orders/summary').set(bearer(admin.token))).body.data.newMessages).toBe(1);
    expect((await api().patch(`/api/v1/admin/messages/${list[0]._id}`).set(bearer(admin.token)).send({ status: 'done' })).body.data.message.status).toBe('done');
    expect((await api().patch(`/api/v1/admin/messages/${list[0]._id}`).set(bearer(admin.token)).send({ status: 'weird' })).status).toBe(400);
    expect((await api().get('/api/v1/admin/orders/summary').set(bearer(admin.token))).body.data.newMessages).toBe(0);
  });
});

describe('website settings', () => {
  const put = (token: string, section: string, body: object) => api().put(`/api/v1/admin/settings/${section}`).set(bearer(token)).send(body);
  it('edits business details; they show on the public site; bad input is refused', async () => {
    await shop(); const admin = await makeAdmin('admin');
    const good = { name: 'Beauty Organic Hair Oil', legalName: '', phone: '01857164863', whatsapp: '8801857164863', email: 'hello@example.com', address: '12 Example Road, Dhaka', social: { facebook: 'https://facebook.com/example', instagram: '', youtube: '', tiktok: '' } };
    expect((await put(admin.token, 'business', { ...good, whatsapp: '01857164863' })).status).toBe(400);
    expect((await put(admin.token, 'business', { ...good, social: { facebook: 'http://insecure.example' } })).status).toBe(400);
    expect((await put(admin.token, 'business', { ...good, social: { facebook: 'javascript:alert(1)' } })).status).toBe(400);
    expect((await put(admin.token, 'business', { ...good, email: 'nope' })).status).toBe(400);
    expect((await put(admin.token, 'business', { ...good, hack: 1 })).status).toBe(400);
    expect((await put(admin.token, 'business', good)).body.data.business).toMatchObject({ email: 'hello@example.com', address: '12 Example Road, Dhaka' });
    const pub = (await api().get('/api/v1/settings/public')).body.data.business;
    expect(pub).toMatchObject({ phone: '01857164863', whatsapp: '8801857164863', email: 'hello@example.com', address: '12 Example Road, Dhaka', social: { facebook: 'https://facebook.com/example' } });
  });
  it('edits delivery zones and fees — and the price customers pay follows immediately', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin');
    const cur = (await api().get('/api/v1/admin/settings').set(bearer(admin.token))).body.data.delivery;
    const quote = async (district: string) => (await api().post('/api/v1/cart/quote').send({ items: [{ productId: ids.oil, sku: 'HO-OIL-200', qty: 1 }], district })).body.data.deliveryFee;
    expect(await quote('Gazipur')).toBe(120);
    const zones = cur.zones.map((z: { key: string; districts: string[]; fee: number }) => z.key === 'inside_rangpur' ? { ...z, fee: 70, districts: [...z.districts, 'Gazipur', 'Narayanganj'] } : z);
    expect((await put(admin.token, 'delivery', { zones, defaultZoneKey: 'outside_rangpur' })).status).toBe(200);
    expect(await quote('Rangpur')).toBe(70);
    expect(await quote('Gazipur')).toBe(70);
    expect(await quote('Sylhet')).toBe(120);
    // refusals
    const bad = (z: unknown, def = 'outside_rangpur') => put(admin.token, 'delivery', { zones: z, defaultZoneKey: def });
    expect((await bad(zones.map((z: { key: string; districts: string[] }) => z.key === 'outside_rangpur' ? { ...z, districts: ['Gazipur'] } : z))).status).toBe(400); // district in two zones
    expect((await bad(zones, 'nowhere')).status).toBe(400);
    expect((await bad(zones.map((z: { key: string }) => z.key === 'outside_rangpur' ? { ...z, active: false } : z))).status).toBe(400); // inactive default
    expect((await bad(zones.map((z: { key: string }) => z.key === 'inside_rangpur' ? { ...z, fee: -5 } : z))).status).toBe(400);
    expect((await bad(zones.map((z: { key: string }) => z.key === 'inside_rangpur' ? { ...z, fee: 12.5 } : z))).status).toBe(400);
    expect((await bad(zones.map((z: { key: string }) => z.key === 'inside_rangpur' ? { ...z, districts: ['Atlantis'] } : z))).status).toBe(400);
    expect((await bad([])).status).toBe(400);
    expect(await quote('Rangpur')).toBe(70); // refused edits changed nothing
  });
  it('edits the announcement (Bangla + English, link, expiry) and the FAQ', async () => {
    await shop(); const admin = await makeAdmin('admin');
    const content = { announcement: { text: 'Free delivery on combos', textBn: 'কম্বোতে ফ্রি ডেলিভারি', link: '#offer', active: true, expiresAt: '' }, faq: [{ q: 'Is it safe?', a: 'Patch-test first.', qBn: 'নিরাপদ?', aBn: 'আগে পরীক্ষা করুন।' }] };
    expect((await put(admin.token, 'content', { announcement: { ...content.announcement, link: 'javascript:alert(1)' } })).status).toBe(400);
    expect((await put(admin.token, 'content', { faq: [{ q: 'x', a: 'y' }] })).status).toBe(400);
    expect((await put(admin.token, 'content', {})).status).toBe(400);
    expect((await put(admin.token, 'content', content)).status).toBe(200);
    let pub = (await api().get('/api/v1/settings/public')).body.data;
    expect(pub.announcement).toEqual({ text: 'Free delivery on combos', textBn: 'কম্বোতে ফ্রি ডেলিভারি', link: '#offer' });
    expect(pub.faq).toEqual(content.faq);
    await put(admin.token, 'content', { announcement: { ...content.announcement, expiresAt: '2020-01-01' } });
    pub = (await api().get('/api/v1/settings/public')).body.data;
    expect(pub.announcement).toBeNull(); // expired
    await put(admin.token, 'content', { announcement: { ...content.announcement, active: false } });
    expect((await api().get('/api/v1/settings/public')).body.data.announcement).toBeNull();
  });
  it('protects settings (admin only) and records every change in the audit log', async () => {
    await shop(); const admin = await makeAdmin('admin'); const staff = await makeAdmin('staff');
    expect((await api().get('/api/v1/admin/settings')).status).toBe(401);
    expect((await api().get('/api/v1/admin/settings').set(bearer(staff.token))).status).toBe(403);
    expect((await put(staff.token, 'business', { name: 'Hacked' })).status).toBe(403);
    expect((await put(admin.token, 'nonsense', {})).status).toBe(400);
    await put(admin.token, 'content', { faq: [{ q: 'Question one?', a: 'Answer one.' }] });
    const log = await AuditLog.findOne({ action: 'settings.content.update' });
    expect(log).toBeTruthy();
    expect(log!.after).toMatchObject({ faqCount: 1 });
    const superadmin = await makeAdmin('superadmin');
    const logs = await api().get('/api/v1/admin/audit-logs').query({ q: 'settings' }).set(bearer(superadmin.token));
    expect(logs.body.data.items.some((l: { action: string }) => l.action === 'settings.content.update')).toBe(true);
    expect((await api().get('/api/v1/admin/audit-logs').set(bearer(admin.token))).status).toBe(403);
  });
});

describe('table filters and exports', () => {
  it('filters orders by date, district, payment method and sorts them', async () => {
    const ids = await shop(40); const admin = await makeAdmin('admin');
    await WebsiteSettings.updateOne({ key: 'main' }, { $set: { 'payments.manual': { enabled: true, bkash: '01711111111' } } });
    const a = await orderOf(await place(ids, {}, { district: 'Sylhet' }));
    const b = await orderOf(await place(ids, { paymentMethod: 'manual_bkash' }, { district: 'Rangpur' }));
    await place(ids, { items: [{ productId: ids.powder, sku: 'HO-PWD-225', qty: 3 }] }, { district: 'Rangpur' });
    await Order.collection.updateOne({ _id: a._id }, { $set: { createdAt: new Date('2026-10-01T10:00:00Z') } });
    const list = async (q: object) => (await api().get('/api/v1/admin/orders').query(q).set(bearer(admin.token))).body.data.items.map((o: { orderNo: string }) => o.orderNo);
    expect(await list({ district: 'Sylhet' })).toEqual([a.orderNo]);
    expect(await list({ method: 'manual_bkash' })).toEqual([b.orderNo]);
    expect(await list({ from: '2026-10-01', to: '2026-10-01' })).toEqual([a.orderNo]);
    expect(await list({ from: '2026-10-02' })).toHaveLength(2);
    expect((await list({ sort: 'oldest' }))[0]).toBe(a.orderNo);
    expect((await list({ sort: 'total_desc' }))[0]).not.toBe(a.orderNo); // the 3-powder order is the biggest
    expect((await api().get('/api/v1/admin/orders').query({ sort: 'random' }).set(bearer(admin.token))).status).toBe(400);
    expect((await api().get('/api/v1/admin/orders').query({ from: '01-10-2026' }).set(bearer(admin.token))).status).toBe(400);
  });
  it('exports payments and inventory for admins only, and records the exports', async () => {
    const ids = await shop(); const admin = await makeAdmin('admin'); const staff = await makeAdmin('staff');
    await WebsiteSettings.updateOne({ key: 'main' }, { $set: { 'payments.manual': { enabled: true, bkash: '01711111111' } } });
    await place(ids, { paymentMethod: 'manual_bkash' });
    const p = await api().get('/api/v1/admin/payments/export').set(bearer(admin.token));
    expect(p.status).toBe(200);
    expect(p.headers['content-disposition']).toContain('payments.csv');
    expect(p.text.split('\r\n')[0]).toContain('Transaction ID');
    expect(p.text).not.toContain('0171'); // no customer phone numbers in the payments sheet
    const i = await api().get('/api/v1/admin/inventory/export').set(bearer(admin.token));
    expect(i.text).toContain('HO-OIL-200');
    expect(await AuditLog.countDocuments({ action: mongoose.trusted({ $in: ['payment.export', 'inventory.export'] }) })).toBe(2);
    for (const path of ['/api/v1/admin/payments/export', '/api/v1/admin/inventory/export', '/api/v1/admin/orders/export']) {
      expect((await api().get(path).set(bearer(staff.token))).status).toBe(403);
      expect((await api().get(path)).status).toBe(401);
    }
  });
});
