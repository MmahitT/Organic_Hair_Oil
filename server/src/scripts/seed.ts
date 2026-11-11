/**
 * Idempotent seed: creates ONLY what is missing and never overwrites data that an admin has edited.
 * Usage: npm run seed -w server [-- --stock=50]   (--stock is for local development only)
 *
 * Owner-confirmed data (PROJECT_SPECIFICATION.md §0.1): prices, sizes, delivery fees, WhatsApp number.
 * Not seeded on purpose: ingredients, reviews, stock levels (unknown) — products start as drafts.
 */
import { pathToFileURL } from 'node:url';
import { connectDb, disconnectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { Admin } from '../models/admin.model.js';
import { Category, Product } from '../models/catalog.model.js';
import { WebsiteSettings } from '../models/misc.model.js';
import { createAdminAccount } from '../services/auth.service.js';

export interface SeedResult { categories: number; products: number; settings: number; admins: number }

const SIMPLE = [
  { slug: 'hair-oil', name: 'Hair Oil', nameBn: 'হেয়ার অয়েল', sku: 'HO-OIL-200', label: '200 ml', sizeValue: 200, sizeUnit: 'ml', price: 550, img: 'hair-oil-bottle', alt: 'Beauty Organic Hair Oil bottle',
    short: 'Our signature Beauty Organic Hair Oil.', shortBn: 'আমাদের সিগনেচার বিউটি অর্গানিক হেয়ার অয়েল।' },
  { slug: 'hair-powder', name: 'Hair Powder', nameBn: 'হেয়ার পাউডার', sku: 'HO-PWD-225', label: '225 g', sizeValue: 225, sizeUnit: 'g', price: 500, img: 'hair-oil-powder-jar', alt: 'Beauty Organic Hair Powder jar',
    short: 'Beauty Organic Hair Powder for your hair-care routine.', shortBn: 'আপনার চুলের যত্নের রুটিনের জন্য বিউটি অর্গানিক হেয়ার পাউডার।' },
  { slug: 'wooden-comb', name: 'Wooden Comb', nameBn: 'কাঠের চিরুনি', sku: 'HO-COMB', label: 'Standard', sizeValue: 1, sizeUnit: 'pcs', price: 150, img: 'wooden-comb', alt: 'Wooden comb engraved Beauty Organic Hair Oil',
    short: 'A wide-tooth wooden comb engraved with our brand name.', shortBn: 'আমাদের ব্র্যান্ডের নাম খোদাই করা চওড়া দাঁতের কাঠের চিরুনি।' },
] as const;
const img = (name: string, alt: string) => [{ url: `/images/${name}.jpg`, alt, isPrimary: true, order: 0 }];
const COMBO_IMG = img('combo-box-packaging', 'Beauty Organic box with hair powder, hair oil and wooden comb');

export async function runSeed(opts: { stock?: number } = {}): Promise<SeedResult> {
  const stock = opts.stock ?? 0;
  const created: SeedResult = { categories: 0, products: 0, settings: 0, admins: 0 };

  let category = await Category.findOne({ slug: 'hair-care' });
  if (!category) { category = await Category.create({ name: 'Hair Care', slug: 'hair-care' }); created.categories++; }

  const ids: Record<string, { id: unknown; sku: string }> = {};
  for (const p of SIMPLE) {
    let doc = await Product.findOne({ slug: p.slug });
    if (!doc) {
      doc = await Product.create({
        name: p.name, nameBn: p.nameBn, slug: p.slug, category: category._id, visibility: 'draft',
        shortDescription: p.short, shortDescriptionBn: p.shortBn, images: img(p.img, p.alt),
        variants: [{ sku: p.sku, label: p.label, sizeValue: p.sizeValue, sizeUnit: p.sizeUnit, regularPrice: p.price, stock }],
      });
      created.products++;
    }
    ids[p.slug] = { id: doc._id, sku: p.sku };
  }

  let combo = await Product.findOne({ slug: 'combo-oil-powder-comb' });
  if (!combo) {
    combo = await Product.create({
      name: 'Combo: Oil + Powder + Free Comb', nameBn: 'কম্বো: অয়েল + পাউডার + ফ্রি চিরুনি', slug: 'combo-oil-powder-comb',
      type: 'bundle', freeDelivery: true, category: category._id, visibility: 'draft', isFeatured: true,
      shortDescription: 'Hair Oil, Hair Powder and a premium wooden comb — with free home delivery.',
      shortDescriptionBn: 'হেয়ার অয়েল, হেয়ার পাউডার ও প্রিমিয়াম কাঠের চিরুনি — সাথে ফ্রি হোম ডেলিভারি।',
      images: COMBO_IMG,
      variants: [{ sku: 'COMBO-OIL-POWDER', label: 'Combo', regularPrice: 999, stock: 0 }],
      bundleItems: [
        { product: ids['hair-oil']!.id, sku: ids['hair-oil']!.sku, quantity: 1 },
        { product: ids['hair-powder']!.id, sku: ids['hair-powder']!.sku, quantity: 1 },
        { product: ids['wooden-comb']!.id, sku: ids['wooden-comb']!.sku, quantity: 1, isGift: true },
      ],
    });
    created.products++;
  }

  // Products created by an earlier seed version have no images/descriptions. Fill them in ONLY if nobody has edited
  // them since creation (updatedAt === createdAt), so admin changes are never overwritten.
  const backfill: Record<string, { images: ReturnType<typeof img>; short: string; shortBn: string }> = {
    ...Object.fromEntries(SIMPLE.map((p) => [p.slug, { images: img(p.img, p.alt), short: p.short, shortBn: p.shortBn }])),
    'combo-oil-powder-comb': { images: COMBO_IMG, short: 'Hair Oil, Hair Powder and a premium wooden comb — with free home delivery.', shortBn: 'হেয়ার অয়েল, হেয়ার পাউডার ও প্রিমিয়াম কাঠের চিরুনি — সাথে ফ্রি হোম ডেলিভারি।' },
  };
  for (const [slug, b] of Object.entries(backfill)) {
    const doc = await Product.findOne({ slug });
    if (doc && doc.images.length === 0 && !doc.shortDescription && doc.updatedAt.getTime() === doc.createdAt.getTime()) {
      await Product.collection.updateOne({ _id: doc._id }, { $set: { images: b.images, shortDescription: b.short, shortDescriptionBn: b.shortBn } }); // raw update keeps updatedAt untouched
    }
  }

  if (!(await WebsiteSettings.exists({ key: 'main' }))) {
    await WebsiteSettings.create({
      key: 'main',
      business: { name: 'Beauty Organic Hair Oil', phone: '01857164863', whatsapp: '8801857164863' },
      delivery: {
        zones: [
          // "Inside Rangpur" = Rangpur district only; owner-confirmed 2026-11-11 (inside ৳60, outside ৳120). Editable in Admin → Website..
          { key: 'inside_rangpur', name: 'Inside Rangpur', districts: ['Rangpur'], fee: 60 },
          { key: 'outside_rangpur', name: 'Outside Rangpur', districts: [], fee: 120 },
        ],
        defaultZoneKey: 'outside_rangpur',
      },
      payments: { codEnabled: true },
      featuredProductId: combo._id,
    });
    created.settings++;
  }

  if (env.SEED_ADMIN_EMAIL && env.SEED_ADMIN_PASSWORD) {
    if (env.SEED_ADMIN_PASSWORD.length < 12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
    if (!(await Admin.exists({ email: env.SEED_ADMIN_EMAIL.toLowerCase() }))) {
      await createAdminAccount({ name: 'Owner', email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD, role: 'superadmin' });
      created.admins++;
    }
  }
  return created;
}

// CLI entry
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (env.NODE_ENV === 'production' && !process.argv.includes('--allow-production')) {
    console.error('Refusing to seed in production without --allow-production (requires owner approval).');
    process.exit(1);
  }
  const stockArg = process.argv.find((a) => a.startsWith('--stock='));
  const stock = stockArg ? Number(stockArg.split('=')[1]) : 0;
  if (!Number.isInteger(stock) || stock < 0) { console.error('--stock must be a non-negative integer'); process.exit(1); }
  if (stock > 0 && env.NODE_ENV === 'production') { console.error('--stock is for development only'); process.exit(1); }
  await connectDb();
  console.log('Seed complete. Newly created:', await runSeed({ stock }));
  await disconnectDb();
}
