import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Admin, Product, WebsiteSettings } from './models/index.js';
import { runSeed } from './scripts/seed.js';
import { clearDb, startTestDb, stopTestDb } from './test/db.js';

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(clearDb);

describe('seed', () => {
  it('creates the owner-confirmed catalogue and settings', async () => {
    const r = await runSeed();
    expect(r).toMatchObject({ categories: 1, products: 4, settings: 1 });
    const price = async (slug: string) => (await Product.findOne({ slug }))!.variants[0]!.regularPrice;
    expect(await price('hair-oil')).toBe(550);
    expect(await price('hair-powder')).toBe(500);
    expect(await price('wooden-comb')).toBe(150);
    expect(await price('combo-oil-powder-comb')).toBe(999);

    const combo = (await Product.findOne({ slug: 'combo-oil-powder-comb' }))!;
    expect(combo.type).toBe('bundle');
    expect(combo.freeDelivery).toBe(true);
    expect(combo.bundleItems).toHaveLength(3);
    expect(combo.bundleItems.find((b) => b.isGift)?.sku).toBe('HO-COMB');

    const s = (await WebsiteSettings.findOne({ key: 'main' }))!;
    expect(s.delivery!.zones.map((z) => z.fee)).toEqual([60, 120]);
    expect(s.business!.whatsapp).toBe('8801857164863');
    expect(String(s.featuredProductId)).toBe(String(combo._id));
  });
  it('starts products as drafts with zero stock (stock is unknown to us)', async () => {
    await runSeed();
    const p = (await Product.findOne({ slug: 'hair-oil' }))!;
    expect(p.visibility).toBe('draft');
    expect(p.variants[0]!.stock).toBe(0);
  });
  it('is idempotent and never overwrites admin edits', async () => {
    await runSeed();
    await Product.updateOne({ slug: 'hair-oil' }, { $set: { 'variants.0.regularPrice': 700, visibility: 'published' } });
    const again = await runSeed({ stock: 99 });
    expect(again).toMatchObject({ categories: 0, products: 0, settings: 0 });
    expect(await Product.countDocuments()).toBe(4);
    const p = (await Product.findOne({ slug: 'hair-oil' }))!;
    expect(p.variants[0]!.regularPrice).toBe(700);
    expect(p.visibility).toBe('published');
    expect(p.variants[0]!.stock).toBe(0);
    expect(await WebsiteSettings.countDocuments()).toBe(1);
  });
  it('does not create an admin unless credentials are configured', async () => {
    await runSeed();
    expect(await Admin.countDocuments()).toBe(0);
  });
});
