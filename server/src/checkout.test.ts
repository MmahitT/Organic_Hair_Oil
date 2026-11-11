import crypto from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DISTRICTS } from './constants/districts.js';
import { Coupon, CouponRedemption, InventoryMovement, Order, Payment, Product, User, WebsiteSettings } from './models/index.js';
import { runSeed } from './scripts/seed.js';
import { cartSignature } from './services/checkout.service.js';
import { generateOrderNo } from './utils/orderNo.js';
import { clearDb, startTestDb, stopTestDb } from './test/db.js';
import { api, bearer, makeAdmin } from './test/helpers.js';

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(clearDb);

type Ids = Record<'oil' | 'powder' | 'comb' | 'combo', string>;
const SKU = { oil: 'HO-OIL-200', powder: 'HO-PWD-225', comb: 'HO-COMB', combo: 'COMBO-OIL-POWDER' } as const;

async function shop(stock = 20): Promise<Ids> {
  await runSeed({ stock });
  await Product.updateMany({}, { $set: { visibility: 'published' } });
  const get = async (slug: string) => String((await Product.findOne({ slug }))!._id);
  return { oil: await get('hair-oil'), powder: await get('hair-powder'), comb: await get('wooden-comb'), combo: await get('combo-oil-powder-comb') };
}
const line = (ids: Ids, k: keyof Ids, qty = 1): { productId: string; sku: string; qty: number } => ({ productId: ids[k], sku: SKU[k], qty });
const stockOf = async (slug: string) => (await Product.findOne({ slug }))!.variants[0]!.stock;

let n = 0;
const customer = (over: Record<string, unknown> = {}) => ({
  name: 'Rahim Uddin', phone: `0171${String(1000000 + n++).slice(-7)}`, district: 'Rangpur', city: 'Mirpur', address: 'House 12, Road 5, Mirpur DOHS', ...over,
});
const body = (ids: Ids, items: ReturnType<typeof line>[], over: Record<string, unknown> = {}) => ({
  idempotencyKey: crypto.randomUUID(), items, customer: customer(), paymentMethod: 'cod', ...over,
});
const quote = (b: object) => api().post('/api/v1/cart/quote').send(b);
const checkout = (b: object) => api().post('/api/v1/checkout').send(b);

describe('order numbers & signatures', () => {
  it('matches the HO-YYMMDD-XXXXX format with an unambiguous alphabet and Dhaka date', () => {
    expect(generateOrderNo(new Date('2026-11-10T20:00:00Z'))).toMatch(/^HO-261111-[A-HJKMNP-Z2-9]{5}$/); // 20:00 UTC = 02:00 next day in Dhaka
    expect(new Set(Array.from({ length: 500 }, () => generateOrderNo())).size).toBe(500);
  });
  it('cart signature ignores line order and merges duplicates', () => {
    expect(cartSignature([{ productId: 'b', sku: 'S', qty: 1 }, { productId: 'a', sku: 'S', qty: 2 }])).toBe(cartSignature([{ productId: 'a', sku: 'S', qty: 1 }, { productId: 'a', sku: 'S', qty: 1 }, { productId: 'b', sku: 'S', qty: 1 }]));
  });
  it('knows all 64 districts', () => { expect(new Set(DISTRICTS).size).toBe(64); });
});

describe('POST /cart/quote — server is the source of truth', () => {
  it('prices from the database with owner-confirmed delivery fees (৳60 Rangpur / ৳120 outside)', async () => {
    const ids = await shop();
    const dhaka = (await quote({ items: [line(ids, 'oil')], district: 'Rangpur' })).body.data;
    expect(dhaka).toMatchObject({ subtotal: 550, productDiscount: 0, couponDiscount: 0, deliveryFee: 60, total: 610, freeDelivery: false });
    expect(dhaka.zone.key).toBe('inside_rangpur');
    const out = (await quote({ items: [line(ids, 'oil'), line(ids, 'comb', 2)], district: 'Sylhet' })).body.data;
    expect(out).toMatchObject({ subtotal: 850, deliveryFee: 120, total: 970 });
    expect(out.zone.key).toBe('outside_rangpur');
  });
  it('resolves the zone from zoneKey (cart drawer) and falls back to the default zone', async () => {
    const ids = await shop();
    expect((await quote({ items: [line(ids, 'oil')], zoneKey: 'inside_rangpur' })).body.data.deliveryFee).toBe(60);
    expect((await quote({ items: [line(ids, 'oil')] })).body.data.deliveryFee).toBe(120);
  });
  it('the combo ships free everywhere and the free-gift comb is part of its price', async () => {
    const ids = await shop();
    const q = (await quote({ items: [line(ids, 'combo'), line(ids, 'comb')], district: 'Sylhet' })).body.data;
    expect(q).toMatchObject({ subtotal: 1149, deliveryFee: 0, total: 1149, freeDelivery: true });
  });
  it('applies discount windows and reports them as product discount', async () => {
    const ids = await shop();
    await Product.updateOne({ _id: ids.oil }, { $set: { 'variants.0.discountPrice': 450 } });
    const q = (await quote({ items: [line(ids, 'oil', 2)], district: 'Rangpur' })).body.data;
    expect(q).toMatchObject({ subtotal: 1100, productDiscount: 200, total: 960 }); // 900 + 60
    expect(q.lines[0]).toMatchObject({ unitPrice: 450, regularPrice: 550, lineTotal: 900 });
  });
  it('ignores any price, total or fee supplied by the client', async () => {
    const ids = await shop();
    const tampered = { items: [{ ...line(ids, 'oil'), unitPrice: 1, price: 1, lineTotal: 1 }], district: 'Rangpur', total: 1, deliveryFee: 0, subtotal: 1, discount: 999 };
    const res = await quote(tampered);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ subtotal: 550, deliveryFee: 60, total: 610 });
  });
  it('clamps quantity to stock with a warning and flags unavailable items', async () => {
    const ids = await shop(3);
    const q = (await quote({ items: [line(ids, 'oil', 7)], district: 'Rangpur' })).body.data;
    expect(q.lines[0]).toMatchObject({ qty: 3, requestedQty: 7, issue: 'STOCK_REDUCED' });
    expect(q.warnings[0].code).toBe('STOCK_REDUCED');
    expect(q.total).toBe(3 * 550 + 60);
    await Product.updateOne({ _id: ids.comb }, { $set: { forceOutOfStock: true } });
    const q2 = (await quote({ items: [line(ids, 'comb')], district: 'Rangpur' })).body.data;
    expect(q2.lines[0]).toMatchObject({ unavailable: true, qty: 0 });
    expect(q2.total).toBe(0);
  });
  it('treats unpublished/unknown products and unknown SKUs as unavailable (never priced)', async () => {
    const ids = await shop();
    await Product.updateOne({ _id: ids.powder }, { $set: { visibility: 'draft' } });
    const q = (await quote({ items: [line(ids, 'powder'), { productId: '0'.repeat(24), sku: 'NOPE-1', qty: 1 }, { ...line(ids, 'oil'), sku: 'WRONG-SKU' }], district: 'Rangpur' })).body.data;
    expect(q.lines.every((l: { unavailable: boolean }) => l.unavailable)).toBe(true);
    expect(q.total).toBe(0);
  });
  it('merges duplicate lines and enforces input limits', async () => {
    const ids = await shop();
    const q = (await quote({ items: [line(ids, 'oil'), line(ids, 'oil')], district: 'Rangpur' })).body.data;
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0].qty).toBe(2);
    expect((await quote({ items: [] })).status).toBe(400);
    expect((await quote({ items: [{ ...line(ids, 'oil'), qty: 11 }] })).status).toBe(400);
    expect((await quote({ items: [{ ...line(ids, 'oil'), qty: 0 }] })).status).toBe(400);
    expect((await quote({ items: [{ productId: { $ne: '' }, sku: 'X-1', qty: 1 }] })).status).toBe(400);
    expect((await quote({ items: [line(ids, 'oil')], district: 'Atlantis' })).status).toBe(400);
  });
  it('is also correct for bundles whose parts are limited', async () => {
    const ids = await shop(20);
    await Product.updateOne({ _id: ids.comb }, { $set: { 'variants.0.stock': 2 } });
    const q = (await quote({ items: [line(ids, 'combo', 5)], district: 'Rangpur' })).body.data;
    expect(q.lines[0]).toMatchObject({ qty: 2, issue: 'STOCK_REDUCED' });
  });
});

describe('coupons', () => {
  const mk = (over: Record<string, unknown>) => Coupon.create({ code: 'SAVE10', type: 'percent', value: 10, ...over });
  const withCoupon = (ids: Ids, code: string, extra: Record<string, unknown> = {}) => quote({ items: [line(ids, 'oil', 2)], district: 'Rangpur', couponCode: code, ...extra });

  it('percent (floored, capped), fixed (never above the subtotal) and free-delivery coupons', async () => {
    const ids = await shop();
    await mk({}); await mk({ code: 'CAP', value: 50, maxDiscount: 100 }); await mk({ code: 'FIX', type: 'fixed', value: 5000 }); await mk({ code: 'FREEDEL', type: 'free_delivery', value: 0 });
    expect((await withCoupon(ids, 'SAVE10')).body.data).toMatchObject({ couponDiscount: 110, total: 1100 - 110 + 60 });
    expect((await withCoupon(ids, 'CAP')).body.data.couponDiscount).toBe(100);
    expect((await withCoupon(ids, 'FIX')).body.data).toMatchObject({ couponDiscount: 1100, total: 60 });
    const fd = (await withCoupon(ids, 'FREEDEL')).body.data;
    expect(fd).toMatchObject({ couponDiscount: 0, deliveryFee: 0, freeDelivery: true, total: 1100 });
    expect((await withCoupon(ids, 'save10')).body.data.coupon.code).toBe('SAVE10'); // case-insensitive
  });
  it('reports every invalid reason with a message and still returns normal totals', async () => {
    const ids = await shop();
    const day = 86_400_000;
    await mk({ code: 'OFF', isActive: false }); await mk({ code: 'FUTURE', startsAt: new Date(Date.now() + day) }); await mk({ code: 'OLD', expiresAt: new Date(Date.now() - day) });
    await mk({ code: 'BIG', minOrderValue: 5000 }); await mk({ code: 'USED', usageLimit: 1, usedCount: 1 }); await mk({ code: 'ONLYCOMB', appliesToProducts: [ids.comb] });
    const expectations: [string, string][] = [['NOPE', 'NOT_FOUND'], ['OFF', 'INACTIVE'], ['FUTURE', 'NOT_STARTED'], ['OLD', 'EXPIRED'], ['BIG', 'MIN_ORDER'], ['USED', 'LIMIT_REACHED'], ['ONLYCOMB', 'NOT_APPLICABLE']];
    for (const [code, reason] of expectations) {
      const d = (await withCoupon(ids, code)).body.data;
      expect(d.couponError.reason, code).toBe(reason);
      expect(d.total).toBe(1160);
      const v = (await api().post('/api/v1/coupons/validate').send({ code, items: [line(ids, 'oil', 2)] })).body.data;
      expect(v).toMatchObject({ valid: false, reason });
    }
  });
  it('restricts the discount to eligible products only', async () => {
    const ids = await shop();
    await mk({ code: 'COMB20', value: 20, appliesToProducts: [ids.comb] });
    const q = (await quote({ items: [line(ids, 'oil'), line(ids, 'comb', 2)], district: 'Rangpur', couponCode: 'COMB20' })).body.data;
    expect(q.couponDiscount).toBe(60); // 20% of 300, not of 850
  });
  it('validate endpoint returns the discount for a good code', async () => {
    const ids = await shop();
    await mk({});
    const v = (await api().post('/api/v1/coupons/validate').send({ code: 'SAVE10', items: [line(ids, 'oil')] })).body.data;
    expect(v).toMatchObject({ valid: true, discount: 55, type: 'percent' });
  });
});

describe('POST /checkout — Cash on Delivery', () => {
  it('creates the order, takes stock (including every bundle part and the gift), logs movements and a COD payment', async () => {
    const ids = await shop();
    const res = await checkout(body(ids, [line(ids, 'combo', 2), line(ids, 'oil')], { customer: customer({ district: 'Sylhet', email: 'A@B.CO', instructions: 'Call first' }) }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ replay: false, status: 'pending', paymentStatus: 'cod_pending', total: 2 * 999 + 550 + 0 }); // combo present => free delivery
    expect(res.body.data.orderNo).toMatch(/^HO-\d{6}-[A-Z0-9]{5}$/);
    // combo x2 takes 2 oil + 2 powder + 2 comb; plus 1 oil line
    expect(await stockOf('hair-oil')).toBe(20 - 3);
    expect(await stockOf('hair-powder')).toBe(20 - 2);
    expect(await stockOf('wooden-comb')).toBe(20 - 2);

    const order = (await Order.findOne({ orderNo: res.body.data.orderNo }).lean())!;
    expect(order).toMatchObject({ status: 'pending', paymentMethod: 'cod', paymentStatus: 'cod_pending', subtotal: 2548, deliveryFee: 0, total: 2548 });
    expect(order.customer).toMatchObject({ name: 'Rahim Uddin', email: 'a@b.co', instructions: 'Call first', district: 'Sylhet' });
    expect(order.items.find((i) => i.variantSku === 'COMBO-OIL-POWDER')!.components.map((c) => [c.name, c.quantity])).toEqual([['Hair Oil', 2], ['Hair Powder', 2], ['Wooden Comb', 2]]);
    expect(order.statusHistory[0]).toMatchObject({ status: 'pending', by: 'customer' });
    expect(order.meta?.ipHash).toBeTruthy();
    const pay = (await Payment.findOne({ order: order._id }).lean())!;
    expect(pay).toMatchObject({ provider: 'cod', status: 'cod_pending', amount: 2548, currency: 'BDT', tranId: `COD-${order.orderNo}` });
    expect(String(order.payment)).toBe(String(pay._id));
    expect(await InventoryMovement.countDocuments({ order: order._id, reason: 'order' })).toBe(3);
    expect((await Product.findOne({ slug: 'combo-oil-powder-comb' }))!.soldCount).toBe(2);
  });
  it('charges the zone fee for non-combo orders and snapshots prices (later price changes do not alter the order)', async () => {
    const ids = await shop();
    const res = await checkout(body(ids, [line(ids, 'oil')], { customer: customer({ district: 'Rangpur' }) }));
    expect(res.body.data.total).toBe(610);
    await Product.updateOne({ _id: ids.oil }, { $set: { 'variants.0.regularPrice': 9999 } });
    expect((await Order.findOne({ orderNo: res.body.data.orderNo }))!.total).toBe(610);
  });
  it('rejects a stale/tampered expectedTotal with PRICE_CHANGED and creates nothing', async () => {
    const ids = await shop();
    const res = await checkout(body(ids, [line(ids, 'oil')], { expectedTotal: 1 }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRICE_CHANGED');
    expect(res.body.error.details.quote.total).toBe(610); // the true server total for Rangpur
    expect(await Order.countDocuments()).toBe(0);
    expect(await stockOf('hair-oil')).toBe(20);
  });
  it('accepts a correct expectedTotal', async () => {
    const ids = await shop();
    const res = await checkout(body(ids, [line(ids, 'oil')], { expectedTotal: 610 }));
    expect(res.status).toBe(201);
  });
  it('ignores client-supplied prices in the body', async () => {
    const ids = await shop();
    const b = body(ids, [{ ...line(ids, 'oil'), unitPrice: 1, lineTotal: 1 } as ReturnType<typeof line>], { total: 1, deliveryFee: 0, subtotal: 1 });
    const res = await checkout(b);
    expect(res.status).toBe(201);
    expect(res.body.data.total).toBe(610);
  });
  it('validates customer data (phone normalisation, district, address length, email)', async () => {
    const ids = await shop();
    const ok = await checkout(body(ids, [line(ids, 'oil')], { customer: customer({ phone: '+8801712345678' }) }));
    expect(ok.status).toBe(201);
    expect((await Order.findOne({ orderNo: ok.body.data.orderNo }))!.customer!.phone).toBe('01712345678');
    const bad = async (over: Record<string, unknown>) => (await checkout(body(ids, [line(ids, 'oil')], { customer: customer(over) }))).status;
    expect(await bad({ phone: '12345' })).toBe(400);
    expect(await bad({ phone: '01212345678' })).toBe(400);
    expect(await bad({ district: 'Narnia' })).toBe(400);
    expect(await bad({ address: 'short' })).toBe(400);
    expect(await bad({ name: 'A' })).toBe(400);
    expect(await bad({ email: 'not-an-email' })).toBe(400);
    expect(await bad({ email: '' })).toBe(201);
    expect((await checkout({ ...body(ids, [line(ids, 'oil')]), idempotencyKey: 'not-a-uuid' })).status).toBe(400);
  });
  it('refuses unavailable payment methods and respects COD settings (disabled / max amount)', async () => {
    const ids = await shop();
    expect((await checkout(body(ids, [line(ids, 'oil')], { paymentMethod: 'manual_bkash' }))).body.error.code).toBe('PAYMENT_METHOD_UNAVAILABLE'); // owner has not switched it on
    await WebsiteSettings.updateOne({ key: 'main' }, { $set: { 'payments.codMaxAmount': 500 } });
    const limit = await checkout(body(ids, [line(ids, 'oil')]));
    expect(limit.status).toBe(422);
    expect(limit.body.error.code).toBe('COD_LIMIT');
    await WebsiteSettings.updateOne({ key: 'main' }, { $set: { 'payments.codMaxAmount': null, 'payments.codEnabled': false } });
    expect((await checkout(body(ids, [line(ids, 'oil')]))).body.error.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
    expect(await Order.countDocuments()).toBe(0);
  });
  it('honours the auto-confirm setting', async () => {
    const ids = await shop();
    await WebsiteSettings.updateOne({ key: 'main' }, { $set: { 'orderSettings.autoConfirm': true } });
    const res = await checkout(body(ids, [line(ids, 'oil')]));
    expect(res.body.data.status).toBe('confirmed');
    expect((await Order.findOne({ orderNo: res.body.data.orderNo }))!.statusHistory.map((h) => h.status)).toEqual(['pending', 'confirmed']);
  });
  it('blocks orders from blocked customers without revealing why', async () => {
    const ids = await shop();
    await User.create({ name: 'Bad Actor', phone: '01799999999', passwordHash: 'x', isBlocked: true });
    const res = await checkout(body(ids, [line(ids, 'oil')], { customer: customer({ phone: '01799999999' }) }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_BLOCKED');
  });
  it('links the order to a logged-in customer but keeps guest checkout working with an invalid token', async () => {
    const ids = await shop();
    const reg = await api().post('/api/v1/auth/register').send({ name: 'Logged In', phone: '01833445566', password: 'Correct-Horse-9' });
    const t = reg.body.data.accessToken as string;
    const mine = await api().post('/api/v1/checkout').set(bearer(t)).send(body(ids, [line(ids, 'comb')], { customer: customer({ phone: '01833445566' }) }));
    expect(String((await Order.findOne({ orderNo: mine.body.data.orderNo }))!.user)).toBe(reg.body.data.account._id);
    const guest = await api().post('/api/v1/checkout').set(bearer('garbage')).send(body(ids, [line(ids, 'comb')]));
    expect(guest.status).toBe(201);
    expect((await Order.findOne({ orderNo: guest.body.data.orderNo }))!.user).toBeUndefined();
  });
});

describe('stock safety', () => {
  it('rolls back EVERYTHING when a later line fails (no partial stock loss, no coupon use, no order)', async () => {
    const ids = await shop(20);
    await Product.updateOne({ _id: ids.comb }, { $set: { 'variants.0.stock': 1 } });
    await Coupon.create({ code: 'SAVE10', type: 'percent', value: 10, usageLimit: 5 });
    // two combs wanted but only 1 exists; the oil line is processed first and must be restored
    const res = await checkout(body(ids, [line(ids, 'oil', 2), line(ids, 'comb', 2)], { couponCode: 'SAVE10' }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf('hair-oil')).toBe(20);
    expect(await stockOf('wooden-comb')).toBe(1);
    expect(await Order.countDocuments()).toBe(0);
    expect(await InventoryMovement.countDocuments({ reason: 'order' })).toBe(0);
    expect((await Coupon.findOne({ code: 'SAVE10' }))!.usedCount).toBe(0);
  });
  it('rolls back when the order needs more of a shared part than exists across lines (oil alone + combo)', async () => {
    const ids = await shop(20);
    await Product.updateOne({ _id: ids.oil }, { $set: { 'variants.0.stock': 2 } });
    const res = await checkout(body(ids, [line(ids, 'oil', 2), line(ids, 'combo', 1)])); // needs 3 oil in total, 2 exist
    expect(res.status).toBe(422);
    expect(await stockOf('hair-oil')).toBe(2);
    expect(await stockOf('hair-powder')).toBe(20);
    expect(await Order.countDocuments()).toBe(0);
  });
  it('refuses to sell more than available and reports the problem lines', async () => {
    const ids = await shop(2);
    const res = await checkout(body(ids, [line(ids, 'oil', 3)]));
    expect(res.status).toBe(422);
    expect(res.body.error.details[0]).toMatchObject({ productId: ids.oil, requested: 3, available: 2 });
    expect(await stockOf('hair-oil')).toBe(2);
  });
  it('refuses force-out-of-stock and unpublished products', async () => {
    const ids = await shop();
    await Product.updateOne({ _id: ids.oil }, { $set: { forceOutOfStock: true } });
    expect((await checkout(body(ids, [line(ids, 'oil')]))).status).toBe(422);
    await Product.updateOne({ _id: ids.comb }, { $set: { visibility: 'draft' } });
    expect((await checkout(body(ids, [line(ids, 'comb')]))).status).toBe(422);
    expect(await Order.countDocuments()).toBe(0);
  });
  it('backorder products take only the stock that exists and never go negative', async () => {
    const ids = await shop(20);
    await Product.updateOne({ _id: ids.comb }, { $set: { 'variants.0.stock': 1, allowBackorder: true } });
    const res = await checkout(body(ids, [line(ids, 'comb', 3)]));
    expect(res.status).toBe(201);
    expect(await stockOf('wooden-comb')).toBe(0);
  });
  it('30 parallel customers, stock of 10 → exactly 10 orders, 20 clean rejections, stock never negative', async () => {
    const ids = await shop(10);
    const results = await Promise.all(Array.from({ length: 30 }, () => checkout(body(ids, [line(ids, 'oil')]))));
    const ok = results.filter((r) => r.status === 201).length;
    const rejected = results.filter((r) => r.status === 422 && r.body.error.code === 'INSUFFICIENT_STOCK').length;
    expect(ok).toBe(10);
    expect(rejected).toBe(20);
    expect(await stockOf('hair-oil')).toBe(0);
    expect(await Order.countDocuments()).toBe(10);
    expect(await Payment.countDocuments()).toBe(10);
    expect(await InventoryMovement.countDocuments({ reason: 'order' })).toBe(10);
  });
  it('bundles under concurrency: combs limit the combo (stock 3, 12 parallel combo orders → exactly 3)', async () => {
    const ids = await shop(20);
    await Product.updateOne({ _id: ids.comb }, { $set: { 'variants.0.stock': 3 } });
    const results = await Promise.all(Array.from({ length: 12 }, () => checkout(body(ids, [line(ids, 'combo')]))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(await stockOf('wooden-comb')).toBe(0);
    expect(await stockOf('hair-oil')).toBe(17); // only the 3 successful orders took oil/powder
    expect(await stockOf('hair-powder')).toBe(17);
  });
  it('coupon usage limit holds under concurrency (limit 4, 12 parallel orders with the coupon → exactly 4 orders)', async () => {
    const ids = await shop(50);
    await Coupon.create({ code: 'LIMITED', type: 'fixed', value: 50, usageLimit: 4, perCustomerLimit: 5 });
    const results = await Promise.all(Array.from({ length: 12 }, () => checkout(body(ids, [line(ids, 'oil')], { couponCode: 'LIMITED' }))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(4);
    expect(results.filter((r) => r.status === 422).every((r) => r.body.error.code === 'COUPON_INVALID')).toBe(true);
    expect((await Coupon.findOne({ code: 'LIMITED' }))!.usedCount).toBe(4);
    expect(await CouponRedemption.countDocuments()).toBe(4);
    expect(await stockOf('hair-oil')).toBe(46); // rejected orders did not keep any stock
  });
});

describe('coupons at checkout', () => {
  it('records the redemption, enforces the per-customer limit and stores a coupon snapshot', async () => {
    const ids = await shop();
    await Coupon.create({ code: 'ONCE', type: 'percent', value: 10, perCustomerLimit: 1 });
    const c = customer();
    const first = await checkout(body(ids, [line(ids, 'oil', 2)], { customer: c, couponCode: 'ONCE' }));
    expect(first.status).toBe(201);
    expect(first.body.data.total).toBe(1100 - 110 + 60);
    const o = (await Order.findOne({ orderNo: first.body.data.orderNo }).lean())!;
    expect(o).toMatchObject({ couponDiscount: 110, coupon: { code: 'ONCE', type: 'percent', value: 10 } });
    expect(await CouponRedemption.countDocuments({ phone: c.phone })).toBe(1);
    const second = await checkout(body(ids, [line(ids, 'comb')], { customer: c, couponCode: 'ONCE' }));
    expect(second.status).toBe(422);
    expect(second.body.error).toMatchObject({ code: 'COUPON_INVALID' });
    expect(second.body.error.details.reason).toBe('CUSTOMER_LIMIT');
  });
  it('an invalid coupon blocks the order instead of silently charging full price', async () => {
    const ids = await shop();
    const res = await checkout(body(ids, [line(ids, 'oil')], { couponCode: 'NOPE123' }));
    expect(res.status).toBe(422);
    expect(await Order.countDocuments()).toBe(0);
  });
});

describe('idempotency & duplicate protection', () => {
  it('the same idempotency key returns the same order and takes stock once', async () => {
    const ids = await shop();
    const b = body(ids, [line(ids, 'oil', 2)]);
    const a = await checkout(b);
    const again = await checkout(b);
    expect(a.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ replay: true, orderNo: a.body.data.orderNo, total: a.body.data.total });
    expect(await stockOf('hair-oil')).toBe(18);
    expect(await Order.countDocuments()).toBe(1);
  });
  it('simultaneous double-submit with the same key creates exactly one order and one stock deduction', async () => {
    const ids = await shop();
    const b = body(ids, [line(ids, 'oil')]);
    const rs = await Promise.all(Array.from({ length: 6 }, () => checkout(b)));
    expect(rs.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(new Set(rs.map((r) => r.body.data.orderNo)).size).toBe(1);
    expect(await Order.countDocuments()).toBe(1);
    expect(await stockOf('hair-oil')).toBe(19);
    expect(await Payment.countDocuments()).toBe(1);
  });
  it('rejects an identical cart from the same phone within the window, unless the customer confirms', async () => {
    const ids = await shop();
    const c = customer();
    const first = await checkout(body(ids, [line(ids, 'oil')], { customer: c }));
    const dup = await checkout(body(ids, [line(ids, 'oil')], { customer: c }));
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: 'DUPLICATE_ORDER', details: { orderNo: first.body.data.orderNo } });
    expect(await stockOf('hair-oil')).toBe(19);
    const confirmed = await checkout(body(ids, [line(ids, 'oil')], { customer: c, allowDuplicate: true }));
    expect(confirmed.status).toBe(201);
    expect((await checkout(body(ids, [line(ids, 'comb')], { customer: c }))).status).toBe(201); // different cart is fine
    expect(await stockOf('hair-oil')).toBe(18);
  });
});

describe('GET /orders/:orderNo/status', () => {
  it('needs the checkout token and exposes only limited, masked data', async () => {
    const ids = await shop();
    const placed = await checkout(body(ids, [line(ids, 'oil')], { customer: customer({ name: 'Karim Hossain', phone: '01712345678', address: 'Secret address 123, Hidden Road', email: 'private@example.com' }) }));
    const { orderNo, orderToken } = placed.body.data;
    const ok = await api().get(`/api/v1/orders/${orderNo}/status?token=${orderToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ orderNo, status: 'pending', paymentMethod: 'cod', total: 610, customer: { firstName: 'Karim', phoneMasked: '017*****678', district: 'Rangpur' } });
    expect(JSON.stringify(ok.body)).not.toMatch(/Secret address|private@example|01712345678|idempotency|ipHash/);

    expect((await api().get(`/api/v1/orders/${orderNo}/status`)).status).toBe(400);
    expect((await api().get(`/api/v1/orders/${orderNo}/status?token=${'x'.repeat(40)}`)).status).toBe(401);
    // a token for one order cannot read another, and an access token is not an order token
    const other = await checkout(body(ids, [line(ids, 'comb')]));
    expect((await api().get(`/api/v1/orders/${orderNo}/status?token=${other.body.data.orderToken}`)).status).toBe(401);
    const admin = await makeAdmin('admin');
    expect((await api().get(`/api/v1/orders/${orderNo}/status?token=${admin.token}`)).status).toBe(401);
    expect((await api().get('/api/v1/orders/HO-000000-AAAAA/status?token=' + orderToken)).status).toBe(401);
  });
});

describe('admin: orders (read-only) and coupons', () => {
  it('lets admin and staff list/search/view orders; denies customers and anonymous', async () => {
    const ids = await shop();
    const placed = await checkout(body(ids, [line(ids, 'oil')], { customer: customer({ name: 'Findable Person', phone: '01755667788' }) }));
    const admin = await makeAdmin('admin'); const staff = await makeAdmin('staff');
    for (const t of [admin.token, staff.token]) {
      const list = await api().get('/api/v1/admin/orders').set(bearer(t));
      expect(list.status).toBe(200);
      expect(list.body.data.items).toHaveLength(1);
      expect((await api().get(`/api/v1/admin/orders?q=${placed.body.data.orderNo}`).set(bearer(t))).body.data.items).toHaveLength(1);
      expect((await api().get('/api/v1/admin/orders?q=01755667788').set(bearer(t))).body.data.items).toHaveLength(1);
      expect((await api().get('/api/v1/admin/orders?q=findable').set(bearer(t))).body.data.items).toHaveLength(1);
      expect((await api().get('/api/v1/admin/orders?q=nobody').set(bearer(t))).body.data.items).toHaveLength(0);
      expect((await api().get('/api/v1/admin/orders?status=delivered').set(bearer(t))).body.data.items).toHaveLength(0);
    }
    const id = (await Order.findOne())!._id;
    expect((await api().get(`/api/v1/admin/orders/${id}`).set(bearer(admin.token))).body.data.order.customer.address).toContain('Mirpur');
    expect((await api().get('/api/v1/admin/orders')).status).toBe(401);
    const cust = await api().post('/api/v1/auth/register').send({ name: 'Cust Omer', phone: '01911112222', password: 'Correct-Horse-9' });
    expect((await api().get('/api/v1/admin/orders').set(bearer(cust.body.data.accessToken))).status).toBe(403);
  });
  it('coupon CRUD is admin-only, validates input and is audited', async () => {
    const admin = await makeAdmin('admin'); const staff = await makeAdmin('staff');
    const post = (b: object, t = admin.token) => api().post('/api/v1/admin/coupons').set(bearer(t)).send(b);
    expect((await post({ code: 'welcome10', type: 'percent', value: 10, usageLimit: 100 })).status).toBe(201);
    expect((await post({ code: 'WELCOME10', type: 'percent', value: 10 })).status).toBe(409);
    expect((await post({ code: 'BAD', type: 'percent', value: 150 })).status).toBe(400);
    expect((await post({ code: 'X', type: 'fixed', value: 5 })).status).toBe(400);
    expect((await post({ code: 'STAFF1', type: 'fixed', value: 5 }, staff.token)).status).toBe(403);
    const id = (await Coupon.findOne({ code: 'WELCOME10' }))!._id;
    expect((await api().patch(`/api/v1/admin/coupons/${id}`).set(bearer(admin.token)).send({ isActive: false })).status).toBe(200);
    expect((await api().get('/api/v1/admin/coupons').set(bearer(admin.token))).body.data.items).toHaveLength(1);
    expect((await api().delete(`/api/v1/admin/coupons/${id}`).set(bearer(admin.token))).status).toBe(204);
  });
});

describe('GET /delivery/zones', () => {
  it('lists active zones, the 64 districts and COD availability', async () => {
    await shop();
    const d = (await api().get('/api/v1/delivery/zones')).body.data;
    expect(d.zones.map((z: { fee: number }) => z.fee)).toEqual([60, 120]);
    expect(d.districts).toHaveLength(64);
    expect(d.codEnabled).toBe(true);
  });
});
