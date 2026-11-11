import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Coupon, Order, Payment, Product, Review, User } from './models/index.js';
import { clearDb, startTestDb, stopTestDb } from './test/db.js';

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(clearDb);

const variant = (over: Record<string, unknown> = {}) => ({ sku: 'HO-OIL-200', label: '200 ml', regularPrice: 550, stock: 10, ...over });
const product = (over: Record<string, unknown> = {}) => ({ name: 'Hair Oil', slug: 'hair-oil', variants: [variant()], ...over });
const oid = () => new mongoose.Types.ObjectId();

const orderDoc = (over: Record<string, unknown> = {}) => ({
  orderNo: 'HO-261110-AB12',
  customer: { name: 'A B', phone: '01712345678', district: 'Rangpur', city: 'Mirpur', address: 'House 1, Road 2, Mirpur' },
  items: [{ product: oid(), variantSku: 'HO-OIL-200', name: 'Hair Oil', unitPrice: 550, quantity: 1, lineTotal: 550 }],
  subtotal: 550, deliveryFee: 60, total: 610, paymentMethod: 'cod', ...over,
});

describe('Product', () => {
  it('saves a valid product with defaults', async () => {
    const p = await Product.create(product());
    expect(p.visibility).toBe('draft');
    expect(p.type).toBe('simple');
    expect(p.variants[0]?.reservedStock).toBe(0);
  });
  it('rejects discount price >= regular price', async () => {
    await expect(Product.create(product({ variants: [variant({ discountPrice: 550 })] }))).rejects.toThrow(/discountPrice/);
    await expect(Product.create(product({ variants: [variant({ discountPrice: 400 })] }))).resolves.toBeTruthy();
  });
  it('rejects fractional or negative money and negative stock', async () => {
    await expect(Product.create(product({ variants: [variant({ regularPrice: 99.5 })] }))).rejects.toThrow();
    await expect(Product.create(product({ variants: [variant({ regularPrice: -1 })] }))).rejects.toThrow();
    await expect(Product.create(product({ variants: [variant({ stock: -1 })] }))).rejects.toThrow();
  });
  it('enforces unique slug and unique SKU across products', async () => {
    await Product.create(product());
    await expect(Product.create(product({ variants: [variant({ sku: 'OTHER' })] }))).rejects.toMatchObject({ code: 11000 });
    await expect(Product.create(product({ slug: 'second' }))).rejects.toMatchObject({ code: 11000 }); // same SKU
  });
  it('requires components for a bundle and at least one variant', async () => {
    await expect(Product.create(product({ type: 'bundle' }))).rejects.toThrow(/component/);
    await expect(Product.create(product({ variants: [] }))).rejects.toThrow(/variant/);
  });
  it('rejects invalid slugs', async () => {
    await expect(Product.create(product({ slug: 'Bad Slug!' }))).rejects.toThrow(/slug/i);
  });
});

describe('User', () => {
  it('enforces unique phone and unique (sparse) email', async () => {
    await User.create({ name: 'Ab', phone: '01712345678', passwordHash: 'x' });
    await expect(User.create({ name: 'Cd', phone: '01712345678', passwordHash: 'x' })).rejects.toMatchObject({ code: 11000 });
    await User.create({ name: 'Cd', phone: '01812345678', passwordHash: 'x' }); // no email: allowed (sparse)
    await User.create({ name: 'Ef', phone: '01912345678', email: 'a@b.co', passwordHash: 'x' });
    await expect(User.create({ name: 'Gh', phone: '01612345678', email: 'a@b.co', passwordHash: 'x' })).rejects.toMatchObject({ code: 11000 });
  });
  it('validates phone format and never serialises the password hash', async () => {
    await expect(User.create({ name: 'Ab', phone: '12345', passwordHash: 'x' })).rejects.toThrow();
    const u = await User.create({ name: 'Ab', phone: '01712345678', passwordHash: 'secret-hash' });
    expect(JSON.stringify(u.toJSON())).not.toContain('secret-hash');
  });
});

describe('Order & Payment relationships', () => {
  it('creates an order with timestamps and a unique order number', async () => {
    const o = await Order.create(orderDoc());
    expect(o.createdAt).toBeInstanceOf(Date);
    await expect(Order.create(orderDoc())).rejects.toMatchObject({ code: 11000 });
  });
  it('rejects bad order numbers, empty items, bad status and fractional totals', async () => {
    await expect(Order.create(orderDoc({ orderNo: 'bad' }))).rejects.toThrow();
    await expect(Order.create(orderDoc({ items: [] }))).rejects.toThrow();
    await expect(Order.create(orderDoc({ status: 'teleported' }))).rejects.toThrow();
    await expect(Order.create(orderDoc({ total: 610.5 }))).rejects.toThrow();
  });
  it('allows many orders without an idempotency key but only one per key', async () => {
    await Order.create(orderDoc({ orderNo: 'HO-261110-AAAA' }));
    await Order.create(orderDoc({ orderNo: 'HO-261110-BBBB' }));
    await Order.create(orderDoc({ orderNo: 'HO-261110-CCCC', idempotencyKey: 'k1' }));
    await expect(Order.create(orderDoc({ orderNo: 'HO-261110-DDDD', idempotencyKey: 'k1' }))).rejects.toMatchObject({ code: 11000 });
  });
  it('payment tranId is unique (duplicate-transaction protection) and manual trxId is unique when present', async () => {
    const order = await Order.create(orderDoc());
    const base = { order: order._id, provider: 'manual', amount: 610 };
    await Payment.create({ ...base, tranId: 'HO-1-aaa' });
    await expect(Payment.create({ ...base, tranId: 'HO-1-aaa' })).rejects.toMatchObject({ code: 11000 });
    await Payment.create({ ...base, tranId: 'HO-1-bbb' }); // no manual.trxId: fine
    await Payment.create({ ...base, tranId: 'HO-1-ccc', manual: { trxId: 'TRX9' } });
    await expect(Payment.create({ ...base, tranId: 'HO-1-ddd', manual: { trxId: 'TRX9' } })).rejects.toMatchObject({ code: 11000 });
  });
  it('payment currency must be BDT', async () => {
    const order = await Order.create(orderDoc());
    await expect(Payment.create({ order: order._id, provider: 'manual', tranId: 't', amount: 1, currency: 'USD' })).rejects.toThrow();
  });
});

describe('Review & Coupon', () => {
  it('limits one review per product per order but allows unattached reviews', async () => {
    const pr = await Product.create(product());
    const order = await Order.create(orderDoc());
    const r = { product: pr._id, name: 'Sara', rating: 5, comment: 'Nice' };
    await Review.create({ ...r, order: order._id });
    await expect(Review.create({ ...r, order: order._id })).rejects.toMatchObject({ code: 11000 });
    await Review.create(r);
    await Review.create(r);
  });
  it('rejects ratings outside 1-5', async () => {
    const pr = await Product.create(product());
    await expect(Review.create({ product: pr._id, name: 'S', rating: 6, comment: 'x' })).rejects.toThrow();
  });
  it('validates coupon codes, types and uniqueness', async () => {
    await Coupon.create({ code: 'save10', type: 'percent', value: 10 });
    await expect(Coupon.create({ code: 'SAVE10', type: 'percent', value: 10 })).rejects.toMatchObject({ code: 11000 });
    await expect(Coupon.create({ code: 'BIG', type: 'percent', value: 150 })).rejects.toThrow();
    await expect(Coupon.create({ code: 'FIX', type: 'fixed', value: 10.5 })).rejects.toThrow();
    await expect(Coupon.create({ code: 'x', type: 'fixed', value: 10 })).rejects.toThrow();
  });
});

describe('Transactions (replica set)', () => {
  it('rolls back all writes when the transaction aborts', async () => {
    const session = await mongoose.startSession();
    await expect(
      session.withTransaction(async () => {
        await Product.create([product()], { session });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await session.endSession();
    expect(await Product.countDocuments()).toBe(0);
  });
  it('commits atomically', async () => {
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await Product.create([product()], { session });
    });
    await session.endSession();
    expect(await Product.countDocuments()).toBe(1);
  });
});
