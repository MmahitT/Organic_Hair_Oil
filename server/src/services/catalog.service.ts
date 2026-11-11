import mongoose, { type FilterQuery } from 'mongoose';
import { Errors } from '../middleware/errorHandler.js';
import { Category, Ingredient, Product, type ProductObj } from '../models/catalog.model.js';
import { InventoryMovement, WebsiteSettings } from '../models/misc.model.js';
import { escapeRegex, slugify } from '../utils/slug.js';

type VariantObj = ProductObj['variants'][number];

/**
 * Operators below are built by the server from validated input only. `sanitizeFilter` (db.ts) would otherwise
 * neutralise them, so they are explicitly marked trusted. NEVER pass req.body/req.query objects through this.
 */
const trusted = mongoose.trusted;

export const MAX_QTY_PER_LINE = 10;
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

/* ---------- pure helpers (unit-tested) ---------- */

export function effectivePrice(v: Pick<VariantObj, 'regularPrice' | 'discountPrice' | 'discountStart' | 'discountEnd'>, now = new Date()) {
  const d = v.discountPrice;
  const active = d != null && d < v.regularPrice && (!v.discountStart || v.discountStart <= now) && (!v.discountEnd || v.discountEnd >= now);
  return active ? { price: d as number, compareAtPrice: v.regularPrice } : { price: v.regularPrice, compareAtPrice: null };
}

export function variantAvailable(p: Pick<ProductObj, 'forceOutOfStock' | 'allowBackorder'>, v: Pick<VariantObj, 'stock' | 'reservedStock' | 'isActive'>): number {
  if (p.forceOutOfStock || !v.isActive) return 0;
  if (p.allowBackorder) return MAX_QTY_PER_LINE;
  return Math.max(0, v.stock - v.reservedStock);
}

export function stockStatus(available: number, threshold: number): StockStatus {
  if (available <= 0) return 'out_of_stock';
  return available <= threshold ? 'low_stock' : 'in_stock';
}

/* ---------- public presentation ---------- */

async function loadComponents(products: ProductObj[]): Promise<Map<string, ProductObj>> {
  const ids = [...new Set(products.flatMap((p) => p.bundleItems.map((b) => String(b.product))))];
  if (ids.length === 0) return new Map();
  const comps = await Product.find({ _id: trusted({ $in: ids }), deletedAt: null }).lean();
  return new Map(comps.map((c) => [String(c._id), c as unknown as ProductObj]));
}

export function bundleAvailable(p: ProductObj, comps: Map<string, ProductObj>): number {
  if (p.forceOutOfStock) return 0;
  let min = Infinity;
  for (const item of p.bundleItems) {
    const c = comps.get(String(item.product));
    const v = c?.variants.find((x) => x.sku === item.sku);
    if (!c || !v) return 0;
    min = Math.min(min, Math.floor(variantAvailable(c, v) / item.quantity));
  }
  return Number.isFinite(min) ? min : 0;
}

export function presentProduct(
  p: ProductObj,
  comps: Map<string, ProductObj>,
  ingredientMap: Map<string, { name: string; nameBn?: string | null; description?: string | null; image?: { url?: string | null } | null }>,
  now = new Date(),
) {
  const isBundle = p.type === 'bundle';
  const bundleQty = isBundle ? bundleAvailable(p, comps) : 0;
  const variants = p.variants.filter((v) => v.isActive).map((v) => {
    const { price, compareAtPrice } = effectivePrice(v, now);
    const available = isBundle ? bundleQty : variantAvailable(p, v);
    const cap = Math.min(available, p.maxPerOrder ?? MAX_QTY_PER_LINE, MAX_QTY_PER_LINE);
    return {
      sku: v.sku, label: v.label, sizeValue: v.sizeValue ?? null, sizeUnit: v.sizeUnit ?? null,
      price, compareAtPrice, stockStatus: stockStatus(available, v.lowStockThreshold), maxQty: cap,
    };
  });
  const primary = variants[0];
  return {
    id: String(p._id), slug: p.slug, type: p.type, name: p.name, nameBn: p.nameBn ?? null,
    shortDescription: p.shortDescription ?? null, shortDescriptionBn: p.shortDescriptionBn ?? null,
    description: p.description ?? null, descriptionBn: p.descriptionBn ?? null,
    images: [...p.images].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.order - b.order).map((i) => ({ url: i.url, alt: i.alt, isPrimary: i.isPrimary })),
    variants,
    price: primary?.price ?? 0, compareAtPrice: primary?.compareAtPrice ?? null,
    stockStatus: primary?.stockStatus ?? ('out_of_stock' as StockStatus), maxQty: primary?.maxQty ?? 0,
    freeDelivery: p.freeDelivery, isFeatured: p.isFeatured,
    bundle: p.bundleItems.map((b) => {
      const c = comps.get(String(b.product));
      const v = c?.variants.find((x) => x.sku === b.sku);
      return { productId: String(b.product), name: c?.name ?? '', nameBn: c?.nameBn ?? null, label: v?.label ?? '', quantity: b.quantity, isGift: b.isGift, unitPrice: v ? effectivePrice(v, now).price : 0 };
    }),
    // Separate-purchase value of all components (computed, never typed) — used for "worth ৳X" / savings display.
    bundleValue: isBundle ? p.bundleItems.reduce((sum, b) => { const v = comps.get(String(b.product))?.variants.find((x) => x.sku === b.sku); return sum + (v ? effectivePrice(v, now).price * b.quantity : 0); }, 0) : null,
    ingredients: [...p.ingredients].sort((a, b) => a.order - b.order).map((i) => ingredientMap.get(String(i.ingredient))).filter(Boolean),
    benefits: p.benefits, howToUse: p.howToUse, seo: p.seo ?? {},
    ratingAverage: p.ratingAverage, ratingCount: p.ratingCount,
  };
}

async function presentMany(list: ProductObj[]) {
  const comps = await loadComponents(list);
  const ingIds = [...new Set(list.flatMap((p) => p.ingredients.map((i) => String(i.ingredient))))];
  const ings = ingIds.length ? await Ingredient.find({ _id: trusted({ $in: ingIds }), isActive: true }).lean() : [];
  const ingMap = new Map(ings.map((i) => [String(i._id), { id: String(i._id), name: i.name, nameBn: i.nameBn, description: i.description, image: i.image }]));
  return list.map((p) => presentProduct(p, comps, ingMap as never));
}

const PUBLIC_FILTER: FilterQuery<ProductObj> = { visibility: 'published', deletedAt: null };

export async function listPublicProducts(opts: { page: number; limit: number; q?: string; category?: string }) {
  const filter: FilterQuery<ProductObj> = { ...PUBLIC_FILTER };
  if (opts.q) filter.name = trusted({ $regex: escapeRegex(opts.q), $options: 'i' });
  if (opts.category) {
    const cat = await Category.findOne({ slug: opts.category, isActive: true }).lean();
    filter.category = cat?._id ?? new mongoose.Types.ObjectId();
  }
  const [docs, total] = await Promise.all([
    Product.find(filter).sort({ isFeatured: -1, createdAt: 1 }).skip((opts.page - 1) * opts.limit).limit(opts.limit).lean(),
    Product.countDocuments(filter),
  ]);
  return { items: await presentMany(docs as unknown as ProductObj[]), total };
}

export async function getPublicProductBySlug(slug: string) {
  const doc = await Product.findOne({ ...PUBLIC_FILTER, slug }).lean();
  if (!doc) throw Errors.notFound('Product not found');
  return (await presentMany([doc as unknown as ProductObj]))[0]!;
}

export async function getFeaturedProduct() {
  const settings = await WebsiteSettings.findOne({ key: 'main' }).lean();
  const byId = settings?.featuredProductId ? await Product.findOne({ ...PUBLIC_FILTER, _id: settings.featuredProductId }).lean() : null;
  const doc = byId ?? (await Product.findOne({ ...PUBLIC_FILTER, isFeatured: true }).lean());
  if (!doc) throw Errors.notFound('No featured product');
  return (await presentMany([doc as unknown as ProductObj]))[0]!;
}

export async function listCategories() {
  return Category.find({ isActive: true }).sort({ order: 1, name: 1 }).lean();
}
export async function listIngredients() {
  return Ingredient.find({ isActive: true }).sort({ order: 1, name: 1 }).lean();
}

/* ---------- admin ---------- */

export async function listAdminProducts(opts: { page: number; limit: number; q?: string; visibility?: string; type?: string; archived?: boolean }) {
  const filter: FilterQuery<ProductObj> = { deletedAt: opts.archived ? trusted({ $ne: null }) : null };
  if (opts.visibility) filter.visibility = opts.visibility;
  if (opts.type) filter.type = opts.type;
  if (opts.q) {
    const rx = trusted({ $regex: escapeRegex(opts.q), $options: 'i' });
    filter.$or = [{ name: rx }, { nameBn: rx }, { slug: rx }, { 'variants.sku': rx }];
  }
  const [items, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: 1 }).skip((opts.page - 1) * opts.limit).limit(opts.limit).lean(),
    Product.countDocuments(filter),
  ]);
  return { items, total };
}

export async function getAdminProduct(id: string) {
  const doc = await Product.findOne({ _id: id }).lean();
  if (!doc) throw Errors.notFound('Product not found');
  return doc;
}

export interface VariantInput {
  sku: string; label: string; sizeValue?: number; sizeUnit?: 'ml' | 'g' | 'pcs'; regularPrice: number;
  discountPrice?: number | null; discountStart?: Date | null; discountEnd?: Date | null;
  stock?: number; lowStockThreshold?: number; isActive?: boolean;
}

export async function resolveSlug(name: string, explicit: string | undefined, excludeId?: string): Promise<string> {
  const base = explicit ?? slugify(name);
  if (!base) throw Errors.businessRule('Please provide a slug (the name has no latin letters to build one from)');
  if (explicit) return explicit; // explicit slugs are checked by the unique index (409)
  let slug = base;
  for (let i = 2; await Product.exists({ slug, ...(excludeId ? { _id: trusted({ $ne: excludeId }) } : {}) }); i++) slug = `${base}-${i}`;
  return slug;
}

export async function setFeatured(productId: string) {
  await Product.updateMany({ _id: trusted({ $ne: productId }), isFeatured: true }, { $set: { isFeatured: false } });
  await Product.updateOne({ _id: productId }, { $set: { isFeatured: true } });
  await WebsiteSettings.updateOne({ key: 'main' }, { $set: { featuredProductId: productId } });
}

export async function movementsFor(opts: { productId?: string; sku?: string; page: number; limit: number }) {
  const filter: Record<string, unknown> = {};
  if (opts.productId) filter['product'] = opts.productId;
  if (opts.sku) filter['sku'] = opts.sku.toUpperCase();
  const [items, total] = await Promise.all([
    InventoryMovement.find(filter).sort({ createdAt: -1 }).skip((opts.page - 1) * opts.limit).limit(opts.limit).lean(),
    InventoryMovement.countDocuments(filter),
  ]);
  return { items, total };
}
