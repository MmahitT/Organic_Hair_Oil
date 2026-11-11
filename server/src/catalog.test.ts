import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLog, InventoryMovement, Product, WebsiteSettings } from './models/index.js';
import { effectivePrice, stockStatus, variantAvailable } from './services/catalog.service.js';
import { clearDb, startTestDb, stopTestDb } from './test/db.js';
import { api, bearer, makeAdmin } from './test/helpers.js';

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(clearDb);

const IMG = { url: '/images/hair-oil-bottle.jpg', alt: 'Bottle' };
const oil = (over: Record<string, unknown> = {}) => ({
  name: 'Hair Oil', nameBn: 'হেয়ার অয়েল', shortDescription: 'Oil', images: [IMG],
  variants: [{ sku: 'ho-oil-200', label: '200 ml', sizeValue: 200, sizeUnit: 'ml', regularPrice: 550, stock: 10 }], ...over,
});
const powder = () => ({ name: 'Hair Powder', images: [IMG], variants: [{ sku: 'HO-PWD-225', label: '225 g', regularPrice: 500, stock: 5 }] });

async function setup() {
  const admin = await makeAdmin('admin');
  const staff = await makeAdmin('staff');
  const post = (body: unknown) => api().post('/api/v1/admin/products').set(bearer(admin.token)).send(body as object);
  return { admin, staff, post };
}

describe('pure helpers', () => {
  const v = { regularPrice: 550, discountPrice: 450 as number | null, discountStart: null as Date | null, discountEnd: null as Date | null };
  it('applies discount only inside its window', () => {
    const now = new Date('2026-06-15');
    expect(effectivePrice(v, now)).toEqual({ price: 450, compareAtPrice: 550 });
    expect(effectivePrice({ ...v, discountStart: new Date('2026-07-01') }, now).price).toBe(550);
    expect(effectivePrice({ ...v, discountEnd: new Date('2026-06-01') }, now).price).toBe(550);
    expect(effectivePrice({ ...v, discountPrice: null }, now)).toEqual({ price: 550, compareAtPrice: null });
    expect(effectivePrice({ ...v, discountPrice: 600 }, now).price).toBe(550); // invalid discount is ignored
  });
  it('derives availability and status', () => {
    const p = { forceOutOfStock: false, allowBackorder: false };
    expect(variantAvailable(p, { stock: 10, reservedStock: 3, isActive: true })).toBe(7);
    expect(variantAvailable({ ...p, forceOutOfStock: true }, { stock: 10, reservedStock: 0, isActive: true })).toBe(0);
    expect(variantAvailable({ ...p, allowBackorder: true }, { stock: 0, reservedStock: 0, isActive: true })).toBeGreaterThan(0);
    expect(variantAvailable(p, { stock: 10, reservedStock: 0, isActive: false })).toBe(0);
    expect(stockStatus(0, 5)).toBe('out_of_stock');
    expect(stockStatus(5, 5)).toBe('low_stock');
    expect(stockStatus(6, 5)).toBe('in_stock');
  });
});

describe('admin product management', () => {
  it('creates a product with auto slug, normalised SKU and an initial-stock movement', async () => {
    const { admin, post } = await setup();
    const res = await post(oil());
    expect(res.status).toBe(201);
    const p = res.body.data.product;
    expect(p.slug).toBe('hair-oil');
    expect(p.variants[0].sku).toBe('HO-OIL-200');
    expect(p.visibility).toBe('draft');
    expect(p.images[0].isPrimary).toBe(true);
    expect(await InventoryMovement.countDocuments({ sku: 'HO-OIL-200', delta: 10 })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'product.created' })).toBe(1);
    expect((await api().get(`/api/v1/admin/products/${p._id}`).set(bearer(admin.token))).status).toBe(200);
  });
  it('enforces unique slug and unique SKU (409) with a helpful message', async () => {
    const { post } = await setup();
    await post(oil());
    const dupSlug = await post(oil({ variants: [{ sku: 'OTHER-1', label: 'x', regularPrice: 1 }] }));
    expect(dupSlug.status).toBe(201); // auto-slug avoids the clash: hair-oil-2
    expect(dupSlug.body.data.product.slug).toBe('hair-oil-2');
    const explicit = await post(oil({ slug: 'hair-oil', variants: [{ sku: 'OTHER-2', label: 'x', regularPrice: 1 }] }));
    expect(explicit.status).toBe(409);
    expect(explicit.body.error.message).toMatch(/slug/);
    const dupSku = await post(oil({ name: 'Another', variants: [{ sku: 'HO-OIL-200', label: 'x', regularPrice: 1 }] }));
    expect(dupSku.status).toBe(409);
    expect(dupSku.body.error.message).toMatch(/sku/i);
  });
  it('validates input: bad image URLs, discount >= price, fractional price, bundle rules, Bangla-only names need a slug', async () => {
    const { post } = await setup();
    expect((await post(oil({ images: [{ url: 'javascript:alert(1)', alt: 'x' }] }))).status).toBe(400);
    expect((await post(oil({ images: [{ url: 'http://insecure.example/x.jpg', alt: 'x' }] }))).status).toBe(400);
    expect((await post(oil({ variants: [{ sku: 'A-1', label: 'x', regularPrice: 100, discountPrice: 100 }] }))).status).toBe(400);
    expect((await post(oil({ variants: [{ sku: 'A-2', label: 'x', regularPrice: 99.5 }] }))).status).toBe(400);
    expect((await post(oil({ variants: [{ sku: 'A-3', label: 'x', regularPrice: -5 }] }))).status).toBe(400);
    expect((await post(oil({ type: 'bundle' }))).status).toBe(400);
    expect((await post(oil({ name: 'শুধু বাংলা', variants: [{ sku: 'BN-1', label: 'x', regularPrice: 5 }] }))).status).toBe(422);
    expect((await post(oil({ name: 'শুধু বাংলা', slug: 'bangla-only', variants: [{ sku: 'BN-2', label: 'x', regularPrice: 5 }] }))).status).toBe(201);
  });
  it('accepts the exact payload the admin form sends: null discount and null discount dates, on create and update', async () => {
    const { admin, post } = await setup();
    const variant = { sku: 'HO-OIL-200', label: '200 ml', regularPrice: 550, discountPrice: null, discountStart: null, discountEnd: null, isActive: true };
    const created = await post(oil({ maxPerOrder: null, category: null, variants: [{ ...variant, stock: 5 }] }));
    expect(created.status).toBe(201);
    const id = created.body.data.product._id;
    const updated = await api().patch(`/api/v1/admin/products/${id}`).set(bearer(admin.token)).send({ maxPerOrder: null, category: null, variants: [variant] });
    expect(updated.status).toBe(200);
    expect(updated.body.data.product.variants[0].stock).toBe(5);
  });
  it('refuses to publish without an image or an active priced variant', async () => {
    const { post } = await setup();
    expect((await post(oil({ images: [], visibility: 'published' }))).status).toBe(422);
    expect((await post(oil({ visibility: 'published' }))).status).toBe(201);
  });
  it('updates price/visibility and records before/after in the audit log', async () => {
    const { admin, post } = await setup();
    const id = (await post(oil())).body.data.product._id;
    const res = await api().patch(`/api/v1/admin/products/${id}`).set(bearer(admin.token)).send({
      visibility: 'published', variants: [{ sku: 'HO-OIL-200', label: '200 ml', regularPrice: 600, discountPrice: 500 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.product.variants[0].stock).toBe(10); // untouched
    const log = (await AuditLog.findOne({ action: 'product.updated' }).lean())!;
    expect((log.before as { variants: { regularPrice: number }[] }).variants[0]!.regularPrice).toBe(550);
    expect((log.after as { variants: { regularPrice: number }[] }).variants[0]!.regularPrice).toBe(600);
  });
  it('does not allow stock changes through the product form', async () => {
    const { admin, post } = await setup();
    const id = (await post(oil())).body.data.product._id;
    const res = await api().patch(`/api/v1/admin/products/${id}`).set(bearer(admin.token)).send({ variants: [{ sku: 'HO-OIL-200', label: '200 ml', regularPrice: 550, stock: 9999 }] });
    expect(res.status).toBe(400);
    expect((await Product.findById(id))!.variants[0]!.stock).toBe(10);
  });
  it('adds a variant at stock 0 and blocks removing a variant that still has stock', async () => {
    const { admin, post } = await setup();
    const id = (await post(oil())).body.data.product._id;
    const base = { sku: 'HO-OIL-200', label: '200 ml', regularPrice: 550 };
    const add = await api().patch(`/api/v1/admin/products/${id}`).set(bearer(admin.token)).send({ variants: [base, { sku: 'HO-OIL-500', label: '500 ml', regularPrice: 1100 }] });
    expect(add.status).toBe(200);
    expect(add.body.data.product.variants[1].stock).toBe(0);
    const remove = await api().patch(`/api/v1/admin/products/${id}`).set(bearer(admin.token)).send({ variants: [{ sku: 'HO-OIL-500', label: '500 ml', regularPrice: 1100 }] });
    expect(remove.status).toBe(422);
  });
  it('archives (soft delete) and hides from the storefront', async () => {
    const { admin, post } = await setup();
    const p = (await post(oil({ visibility: 'published' }))).body.data.product;
    expect((await api().get('/api/v1/products')).body.data.items).toHaveLength(1);
    expect((await api().delete(`/api/v1/admin/products/${p._id}`).set(bearer(admin.token))).status).toBe(204);
    expect((await api().get('/api/v1/products')).body.data.items).toHaveLength(0);
    expect((await api().get(`/api/v1/products/${p.slug}`)).status).toBe(404);
    expect(await Product.countDocuments()).toBe(1); // still in the database for order history
  });
  it('enforces roles: anonymous 401, staff 403 on catalogue management, customers 403', async () => {
    const { staff } = await setup();
    expect((await api().get('/api/v1/admin/products')).status).toBe(401);
    expect((await api().get('/api/v1/admin/products').set(bearer(staff.token))).status).toBe(403);
    expect((await api().post('/api/v1/admin/products').set(bearer(staff.token)).send(oil())).status).toBe(403);
    expect((await api().post('/api/v1/admin/uploads/sign').set(bearer(staff.token))).status).toBe(403);
  });
  it('lists with search, visibility filter and pagination', async () => {
    const { admin, post } = await setup();
    await post(oil());
    await post(powder());
    const q = (s: string) => api().get(`/api/v1/admin/products${s}`).set(bearer(admin.token));
    expect((await q('?q=powder')).body.data.items).toHaveLength(1);
    expect((await q('?q=HO-PWD')).body.data.items).toHaveLength(1);
    expect((await q('?visibility=published')).body.data.items).toHaveLength(0);
    const page = await q('?limit=1&page=2');
    expect(page.body.data.items).toHaveLength(1);
    expect(page.body.meta).toMatchObject({ page: 2, limit: 1, total: 2 });
    expect((await q('?q=.*')).body.data.items).toHaveLength(0); // regex chars are escaped, not interpreted
  });
});

describe('public storefront API', () => {
  it('shows only published products and never leaks exact stock, costs or drafts', async () => {
    const { post } = await setup();
    await post(oil({ visibility: 'published' }));
    await post(powder()); // draft
    const res = await api().get('/api/v1/products');
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    const p = res.body.data.items[0];
    expect(p).toMatchObject({ slug: 'hair-oil', price: 550, compareAtPrice: null, stockStatus: 'in_stock', maxQty: 10 });
    expect(JSON.stringify(res.body)).not.toMatch(/"stock"|reservedStock|deletedAt|lowStockThreshold/);
    expect(res.headers['cache-control']).toMatch(/max-age/);
    expect((await api().get('/api/v1/products/hair-powder')).status).toBe(404);
  });
  it('reflects admin edits immediately (price, discount, out of stock)', async () => {
    const { admin, post } = await setup();
    const id = (await post(oil({ visibility: 'published' }))).body.data.product._id;
    const edit = (b: object) => api().patch(`/api/v1/admin/products/${id}`).set(bearer(admin.token)).send(b);
    await edit({ variants: [{ sku: 'HO-OIL-200', label: '200 ml', regularPrice: 700, discountPrice: 600 }] });
    expect((await api().get('/api/v1/products/hair-oil')).body.data.product).toMatchObject({ price: 600, compareAtPrice: 700 });
    await edit({ forceOutOfStock: true });
    expect((await api().get('/api/v1/products/hair-oil')).body.data.product).toMatchObject({ stockStatus: 'out_of_stock', maxQty: 0 });
    await edit({ forceOutOfStock: false, maxPerOrder: 3 });
    expect((await api().get('/api/v1/products/hair-oil')).body.data.product.maxQty).toBe(3);
    await edit({ visibility: 'hidden' });
    expect((await api().get('/api/v1/products/hair-oil')).status).toBe(404);
  });
  it('reports low stock using the variant threshold', async () => {
    const { admin, post } = await setup();
    const id = (await post(oil({ visibility: 'published' }))).body.data.product._id;
    await api().patch(`/api/v1/admin/inventory/${id}/HO-OIL-200`).set(bearer(admin.token)).send({ set: 4, note: 'recount' });
    expect((await api().get('/api/v1/products/hair-oil')).body.data.product.stockStatus).toBe('low_stock');
    await api().patch(`/api/v1/admin/inventory/${id}/HO-OIL-200`).set(bearer(admin.token)).send({ set: 0, note: 'sold out' });
    expect((await api().get('/api/v1/products/hair-oil')).body.data.product.stockStatus).toBe('out_of_stock');
  });
  it('derives bundle stock from its components and exposes composition + free delivery', async () => {
    const { admin, post } = await setup();
    const o = (await post(oil())).body.data.product; // stock 10
    const pw = (await post(powder())).body.data.product; // stock 5
    const comb = (await post({ name: 'Wooden Comb', images: [IMG], variants: [{ sku: 'HO-COMB', label: 'Std', regularPrice: 150, stock: 3 }] })).body.data.product;
    const combo = await post({
      name: 'Combo', slug: 'combo', type: 'bundle', freeDelivery: true, visibility: 'published', isFeatured: true, images: [IMG],
      variants: [{ sku: 'COMBO-1', label: 'Combo', regularPrice: 999 }],
      bundleItems: [{ product: o._id, sku: 'HO-OIL-200', quantity: 1 }, { product: pw._id, sku: 'HO-PWD-225', quantity: 1 }, { product: comb._id, sku: 'HO-COMB', quantity: 1, isGift: true }],
    });
    expect(combo.status).toBe(201);
    const get = async () => (await api().get('/api/v1/products/combo')).body.data.product;
    let c = await get();
    expect(c).toMatchObject({ price: 999, freeDelivery: true, stockStatus: 'low_stock', maxQty: 3 }); // limited by the comb (3)
    expect(c.bundle.map((b: { name: string; isGift: boolean }) => [b.name, b.isGift])).toEqual([['Hair Oil', false], ['Hair Powder', false], ['Wooden Comb', true]]);
    await api().patch(`/api/v1/admin/inventory/${comb._id}/HO-COMB`).set(bearer(admin.token)).send({ set: 0, note: 'out of combs' });
    c = await get();
    expect(c).toMatchObject({ stockStatus: 'out_of_stock', maxQty: 0 });
    expect((await api().get('/api/v1/products/featured')).body.data.product.slug).toBe('combo');
  });
  it('validates bundle components and refuses direct stock edits on a bundle', async () => {
    const { admin, post } = await setup();
    const o = (await post(oil())).body.data.product;
    const bad = await post({ name: 'Bad', slug: 'bad', type: 'bundle', images: [IMG], variants: [{ sku: 'B-1', label: 'x', regularPrice: 1 }], bundleItems: [{ product: o._id, sku: 'NOPE', quantity: 1 }] });
    expect(bad.status).toBe(422);
    const ok = (await post({ name: 'Ok', slug: 'ok', type: 'bundle', images: [IMG], variants: [{ sku: 'B-2', label: 'x', regularPrice: 1 }], bundleItems: [{ product: o._id, sku: 'HO-OIL-200', quantity: 1 }] })).body.data.product;
    expect((await api().patch(`/api/v1/admin/inventory/${ok._id}/B-2`).set(bearer(admin.token)).send({ delta: 5, note: 'try' })).status).toBe(422);
  });
  it('serves public settings without secrets and respects zone activity', async () => {
    await WebsiteSettings.create({ key: 'main', business: { name: 'Beauty Organic Hair Oil', whatsapp: '8801857164863' }, delivery: { zones: [{ key: 'inside_rangpur', name: 'Inside Rangpur', fee: 60 }, { key: 'x', name: 'Disabled', fee: 1, active: false }] }, payments: { manual: { bkash: '01700000000' } } }); // present in the DB but manual payment is not switched on, so it must not be offered
    const res = await api().get('/api/v1/settings/public');
    expect(res.status).toBe(200);
    expect(res.body.data.delivery.zones).toEqual([{ key: 'inside_rangpur', name: 'Inside Rangpur', fee: 60, etaDays: null }]);
    expect(res.body.data.business.whatsapp).toBe('8801857164863');
    expect(JSON.stringify(res.body)).not.toMatch(/legalPages|passwordHash|refreshToken|apiSecret/);
    expect(JSON.stringify(res.body)).not.toContain('01700000000');
    expect(res.body.data.payments).toEqual({ cod: true, manual: [], bank: null });
    expect(res.body.data.analytics).toEqual({ ga4Id: null, metaPixelId: null }); // only the public tracking IDs, nothing else
  });
});

describe('inventory', () => {
  async function stocked(stock = 10) {
    const ctx = await setup();
    const p = (await ctx.post(oil({ variants: [{ sku: 'HO-OIL-200', label: '200 ml', regularPrice: 550, stock }] }))).body.data.product;
    const adj = (body: object, token = ctx.admin.token) => api().patch(`/api/v1/admin/inventory/${p._id}/HO-OIL-200`).set(bearer(token)).send(body);
    return { ...ctx, p, adj };
  }
  it('adds, removes and sets stock, logging each movement with who and why', async () => {
    const { p, adj, staff } = await stocked();
    expect((await adj({ delta: 5, note: 'new batch' })).body.data).toMatchObject({ before: 10, after: 15, delta: 5 });
    expect((await adj({ delta: -3, note: 'damaged' }, staff.token)).body.data.after).toBe(12); // staff may adjust inventory
    expect((await adj({ set: 40, note: 'recount' })).body.data).toMatchObject({ before: 12, after: 40, delta: 28 });
    const moves = await InventoryMovement.find({ product: p._id }).sort({ createdAt: 1 }).lean();
    expect(moves.map((m) => [m.delta, m.note])).toEqual([[10, 'Initial stock'], [5, 'new batch'], [-3, 'damaged'], [28, 'recount']]);
    expect(await AuditLog.countDocuments({ action: 'inventory.adjusted' })).toBe(3);
  });
  it('never allows negative stock and requires a reason', async () => {
    const { p, adj, admin } = await stocked(2);
    expect((await adj({ delta: -3, note: 'too many' })).status).toBe(422);
    expect((await adj({ set: -1, note: 'negative' })).status).toBe(400);
    expect((await adj({ delta: 1 })).status).toBe(400);
    expect((await adj({ delta: 0, note: 'noop' })).status).toBe(400);
    expect((await adj({ delta: 1.5, note: 'half' })).status).toBe(400);
    expect((await Product.findById(p._id))!.variants[0]!.stock).toBe(2);
    expect((await api().patch(`/api/v1/admin/inventory/${p._id}/NOPE-1`).set(bearer(admin.token)).send({ delta: 1, note: 'unknown sku' })).status).toBe(404);
  });
  it('cannot drop stock below the reserved quantity', async () => {
    const { p, adj } = await stocked(10);
    await Product.updateOne({ _id: p._id }, { $set: { 'variants.0.reservedStock': 6 } });
    expect((await adj({ set: 5, note: 'would break reservations' })).status).toBe(422);
    expect((await Product.findById(p._id))!.variants[0]!.stock).toBe(10);
    expect((await adj({ set: 6, note: 'exactly reserved' })).status).toBe(200);
  });
  it('is safe under concurrency: 50 parallel removals against stock of 10 succeed exactly 10 times', async () => {
    const { p, adj } = await stocked(10);
    const results = await Promise.all(Array.from({ length: 50 }, () => adj({ delta: -1, note: 'parallel sale' })));
    const ok = results.filter((r) => r.status === 200).length;
    const rejected = results.filter((r) => r.status === 422).length;
    expect(ok).toBe(10);
    expect(rejected).toBe(40);
    expect((await Product.findById(p._id))!.variants[0]!.stock).toBe(0);
    expect(await InventoryMovement.countDocuments({ product: p._id, delta: -1 })).toBe(10);
  });
  it('lists inventory and movement history', async () => {
    const { adj, staff, p } = await stocked();
    await adj({ delta: 2, note: 'restock' });
    const inv = await api().get('/api/v1/admin/inventory').set(bearer(staff.token));
    expect(inv.body.data.items[0]).toMatchObject({ sku: 'HO-OIL-200', stock: 12, available: 12, status: 'in_stock' });
    const mv = await api().get(`/api/v1/admin/inventory/movements?productId=${p._id}`).set(bearer(staff.token));
    expect(mv.body.data.items).toHaveLength(2);
    expect(mv.body.meta.total).toBe(2);
  });
});

describe('categories, ingredients and uploads', () => {
  it('manages ingredients (unique, soft delete) and exposes only active ones publicly', async () => {
    const { admin } = await setup();
    const post = (b: object) => api().post('/api/v1/admin/ingredients').set(bearer(admin.token)).send(b);
    const a = await post({ name: 'Neem', nameBn: 'নিম', description: 'Leaf' });
    expect(a.status).toBe(201);
    expect(a.body.data.item.slug).toBe('neem');
    expect((await post({ name: 'Neem' })).status).toBe(409);
    expect((await post({ name: 'x', image: { url: 'javascript:1' } })).status).toBe(400);
    expect((await api().get('/api/v1/ingredients')).body.data.items).toHaveLength(1);
    expect((await api().delete(`/api/v1/admin/ingredients/${a.body.data.item._id}`).set(bearer(admin.token))).status).toBe(204);
    expect((await api().get('/api/v1/ingredients')).body.data.items).toHaveLength(0);
  });
  it('shows linked ingredients on the product page in display order', async () => {
    const { admin, post } = await setup();
    const ing = async (name: string) => (await api().post('/api/v1/admin/ingredients').set(bearer(admin.token)).send({ name })).body.data.item._id;
    const [a, b] = [await ing('Amla'), await ing('Bhringraj')];
    await post(oil({ visibility: 'published', ingredients: [{ ingredient: b, order: 2 }, { ingredient: a, order: 1 }] }));
    const p = (await api().get('/api/v1/products/hair-oil')).body.data.product;
    expect(p.ingredients.map((i: { name: string }) => i.name)).toEqual(['Amla', 'Bhringraj']);
  });
  it('returns 503 (not a crash) when Cloudinary is not configured', async () => {
    const { admin } = await setup();
    const res = await api().post('/api/v1/admin/uploads/sign').set(bearer(admin.token));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('UPLOADS_NOT_CONFIGURED');
  });
});
