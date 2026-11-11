import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Errors } from '../middleware/errorHandler.js';
import { Category, Ingredient, Product } from '../models/catalog.model.js';
import { InventoryMovement, WebsiteSettings } from '../models/misc.model.js';
import { audit } from '../services/audit.service.js';
import * as catalog from '../services/catalog.service.js';
import { adjustStock } from '../services/inventory.service.js';
import { signUpload } from '../utils/cloudinary.js';
import { slugify } from '../utils/slug.js';
import { csv } from '../services/customers.service.js';
import { availableMethods } from './payments.controller.js';

type Q = { page: number; limit: number; q?: string; category?: string; visibility?: string; type?: string; archived?: boolean; productId?: string; sku?: string };
const meta = (q: Q, total: number) => ({ page: q.page, limit: q.limit, total });

/* ---------- public ---------- */
export async function listProducts(req: Request, res: Response) {
  const q = req.query as unknown as Q;
  const { items, total } = await catalog.listPublicProducts(q);
  res.json({ success: true, data: { items }, meta: meta(q, total) });
}
export async function featuredProduct(_req: Request, res: Response) {
  res.json({ success: true, data: { product: await catalog.getFeaturedProduct() } });
}
export async function productBySlug(req: Request, res: Response) {
  res.json({ success: true, data: { product: await catalog.getPublicProductBySlug(req.params['slug']!) } });
}
export async function listCategories(_req: Request, res: Response) {
  res.json({ success: true, data: { items: await catalog.listCategories() } });
}
export async function listIngredients(_req: Request, res: Response) {
  res.json({ success: true, data: { items: await catalog.listIngredients() } });
}
export async function publicSettings(_req: Request, res: Response) {
  const s = await WebsiteSettings.findOne({ key: 'main' }).lean();
  if (!s) throw Errors.notFound('Settings not configured');
  res.json({
    success: true,
    data: {
      currency: s.currency,
      business: {
        name: s.business?.name, phone: s.business?.phone, whatsapp: s.business?.whatsapp, logo: s.business?.logo?.url ?? null,
        email: s.business?.email ?? null, address: s.business?.address ?? null,
        social: Object.fromEntries(Object.entries(s.business?.social ?? {}).filter(([, v]) => v)),
      },
      announcement: s.announcement?.active && (s.announcement.text || s.announcement.textBn) && !(s.announcement.expiresAt && s.announcement.expiresAt < new Date())
        ? { text: s.announcement.text ?? null, textBn: s.announcement.textBn ?? null, link: s.announcement.link ?? null } : null,
      faq: ((s.content as { faq?: unknown[] } | undefined)?.faq ?? []),
      seo: { title: s.seo?.title ?? null, description: s.seo?.description ?? null, titleBn: s.seo?.titleBn ?? null, descriptionBn: s.seo?.descriptionBn ?? null, ogImage: s.seo?.ogImage ?? null },
      // Public by nature (they end up in the page's tracking snippet) — but only the exact, validated ID shapes are ever stored.
      analytics: { ga4Id: s.analytics?.ga4Id ?? null, metaPixelId: s.analytics?.metaPixelId ?? null },
      legalReviewed: Boolean(s.legalReviewed),
      delivery: { zones: (s.delivery?.zones ?? []).filter((z) => z.active).map((z) => ({ key: z.key, name: z.name, fee: z.fee, etaDays: z.etaDays ?? null })) },
      payments: await availableMethods(),
      featureFlags: s.featureFlags ?? {},
    },
  });
}

/* ---------- admin: products ---------- */
const auditView = (p: { name: string; slug: string; visibility: string; forceOutOfStock?: boolean; freeDelivery?: boolean; variants: { sku: string; regularPrice: number; discountPrice?: number | null; isActive?: boolean }[] }) => ({
  name: p.name, slug: p.slug, visibility: p.visibility, forceOutOfStock: p.forceOutOfStock, freeDelivery: p.freeDelivery,
  variants: p.variants.map((v) => ({ sku: v.sku, regularPrice: v.regularPrice, discountPrice: v.discountPrice ?? null, isActive: v.isActive })),
});

function normaliseImages<T extends { isPrimary?: boolean; order?: number }>(images: T[] | undefined) {
  if (!images?.length) return images ?? [];
  const primary = images.findIndex((i) => i.isPrimary);
  return images.map((i, idx) => ({ ...i, order: i.order ?? idx, isPrimary: primary === -1 ? idx === 0 : idx === primary }));
}

async function validateBundle(items: { product: string; sku: string; quantity: number }[], selfId?: string) {
  for (const item of items) {
    if (selfId && item.product === selfId) throw Errors.businessRule('A bundle cannot contain itself');
    const comp = await Product.findOne({ _id: item.product, deletedAt: null }).lean();
    if (!comp) throw Errors.businessRule(`Bundle component not found: ${item.product}`);
    if (comp.type === 'bundle') throw Errors.businessRule('A bundle cannot contain another bundle');
    if (!comp.variants.some((v) => v.sku === item.sku)) throw Errors.businessRule(`Component has no SKU ${item.sku}`);
  }
}

function assertPublishable(p: { images: unknown[]; variants: { isActive?: boolean; regularPrice: number }[] }) {
  if (p.images.length === 0) throw Errors.businessRule('Add at least one image before publishing');
  if (!p.variants.some((v) => v.isActive !== false && v.regularPrice > 0)) throw Errors.businessRule('Add at least one active variant with a price before publishing');
}

export async function adminListProducts(req: Request, res: Response) {
  const q = req.query as unknown as Q;
  const { items, total } = await catalog.listAdminProducts(q);
  res.json({ success: true, data: { items }, meta: meta(q, total) });
}
export async function adminGetProduct(req: Request, res: Response) {
  res.json({ success: true, data: { product: await catalog.getAdminProduct(req.params['id']!) } });
}

export async function createProduct(req: Request, res: Response) {
  const b = req.body;
  const slug = await catalog.resolveSlug(b.name, b.slug);
  if (b.type === 'bundle') await validateBundle(b.bundleItems);
  const images = normaliseImages(b.images);
  if (b.visibility === 'published') assertPublishable({ images, variants: b.variants });

  const session = await mongoose.startSession();
  let created!: InstanceType<typeof Product>;
  try {
    await session.withTransaction(async () => {
      [created] = (await Product.create([{ ...b, slug, images, bundleItems: b.type === 'bundle' ? b.bundleItems : [], isFeatured: false }], { session })) as unknown as [InstanceType<typeof Product>];
      const moves = created.variants.filter((v) => v.stock > 0).map((v) => ({ product: created._id, sku: v.sku, delta: v.stock, reason: 'manual', by: req.principal!.id, note: 'Initial stock' }));
      if (moves.length) await InventoryMovement.create(moves, { session });
    });
  } finally { await session.endSession(); }

  if (b.isFeatured) { await catalog.setFeatured(String(created._id)); created.isFeatured = true; }
  await audit({ action: 'product.created', req, entityType: 'Product', entityId: String(created._id), after: auditView(created) });
  res.status(201).json({ success: true, data: { product: created } });
}

export async function updateProduct(req: Request, res: Response) {
  const id = req.params['id']!;
  const b = req.body;
  const doc = await Product.findOne({ _id: id, deletedAt: null });
  if (!doc) throw Errors.notFound('Product not found');
  const before = auditView(doc);

  const { variants, images, bundleItems, isFeatured, slug, ...scalars } = b;
  if (slug !== undefined) doc.slug = slug;
  doc.set(scalars);
  if (images !== undefined) doc.set('images', normaliseImages(images));
  if (bundleItems !== undefined) {
    if (doc.type !== 'bundle') throw Errors.businessRule('Only bundles can have components');
    await validateBundle(bundleItems, id);
    doc.set('bundleItems', bundleItems);
  }
  if (variants !== undefined) {
    const incoming = new Map<string, (typeof variants)[number]>(variants.map((v: { sku: string }) => [v.sku, v]));
    if (incoming.size !== variants.length) throw Errors.businessRule('Duplicate SKU in this product');
    for (const existing of doc.variants) {
      if (!incoming.has(existing.sku) && (existing.stock > 0 || existing.reservedStock > 0)) {
        throw Errors.businessRule(`Variant ${existing.sku} still has stock; set its stock to 0 first or mark it inactive instead of removing it`);
      }
    }
    const merged = variants.map((v: { sku: string }) => {
      const old = doc.variants.find((x) => x.sku === v.sku);
      return old ? { ...old.toObject(), ...v } : { ...v, stock: 0, reservedStock: 0 }; // new variants start at 0 stock
    });
    doc.set('variants', merged);
  }
  if (doc.visibility === 'published') assertPublishable({ images: doc.images, variants: doc.variants });
  await doc.save();

  if (isFeatured === true) { await catalog.setFeatured(id); doc.isFeatured = true; }
  else if (isFeatured === false && doc.isFeatured) { doc.isFeatured = false; await doc.save(); await WebsiteSettings.updateOne({ key: 'main', featuredProductId: doc._id }, { $unset: { featuredProductId: 1 } }); }

  await audit({ action: 'product.updated', req, entityType: 'Product', entityId: id, before, after: auditView(doc) });
  res.json({ success: true, data: { product: doc } });
}

export async function archiveProduct(req: Request, res: Response) {
  const id = req.params['id']!;
  const doc = await Product.findOne({ _id: id, deletedAt: null });
  if (!doc) throw Errors.notFound('Product not found');
  const before = auditView(doc);
  // Soft delete: orders keep their snapshots; the product disappears from the storefront immediately.
  doc.deletedAt = new Date(); doc.visibility = 'hidden'; doc.isFeatured = false;
  await doc.save();
  await WebsiteSettings.updateOne({ key: 'main', featuredProductId: doc._id }, { $unset: { featuredProductId: 1 } });
  await audit({ action: 'product.archived', req, entityType: 'Product', entityId: id, before, after: auditView(doc) });
  res.status(204).end();
}

/* ---------- admin: inventory ---------- */
export async function adjustInventory(req: Request, res: Response) {
  const { productId, sku } = req.params as { productId: string; sku: string };
  const b = req.body as { delta?: number; set?: number; note: string };
  const mode = b.set !== undefined ? 'set' : 'delta';
  const result = await adjustStock({ productId, sku, mode, value: (b.set ?? b.delta) as number, note: b.note, by: req.principal!.id });
  await audit({ action: 'inventory.adjusted', req, entityType: 'Product', entityId: productId, before: { sku, stock: result.before }, after: { sku, stock: result.after, note: b.note } });
  res.json({ success: true, data: result });
}

export async function listInventory(_req: Request, res: Response) {
  const products = await Product.find({ deletedAt: null, type: 'simple' }).sort({ createdAt: 1 }).lean();
  const items = products.flatMap((p) => p.variants.map((v) => ({
    productId: String(p._id), productName: p.name, visibility: p.visibility, sku: v.sku, label: v.label, isActive: v.isActive,
    stock: v.stock, reserved: v.reservedStock, available: Math.max(0, v.stock - v.reservedStock), lowStockThreshold: v.lowStockThreshold,
    status: catalog.stockStatus(catalog.variantAvailable(p, v), v.lowStockThreshold),
  })));
  res.json({ success: true, data: { items } });
}

export async function listMovements(req: Request, res: Response) {
  const q = req.query as unknown as Q;
  const { items, total } = await catalog.movementsFor(q);
  res.json({ success: true, data: { items }, meta: meta(q, total) });
}

/* ---------- admin: uploads ---------- */
export async function signImageUpload(_req: Request, res: Response) {
  const signed = signUpload();
  if (!signed) throw Object.assign(Errors.businessRule('Image uploads are not configured yet (Cloudinary credentials missing). You can paste an image URL instead.'), { statusCode: 503, code: 'UPLOADS_NOT_CONFIGURED' });
  res.json({ success: true, data: signed });
}

/* ---------- admin: categories & ingredients ---------- */
type TaxDoc = { name: string; isActive: boolean };
function taxonomy(Source: typeof Category | typeof Ingredient, label: string) {
  const Model = Source as unknown as mongoose.Model<TaxDoc>;
  return {
    list: async (_req: Request, res: Response) => {
      res.json({ success: true, data: { items: await Model.find().sort({ order: 1, name: 1 }).lean() } });
    },
    create: async (req: Request, res: Response) => {
      const slug = req.body.slug ?? slugify(req.body.name);
      if (!slug) throw Errors.businessRule('Please provide a slug');
      const doc = await Model.create({ ...req.body, slug });
      await audit({ action: `${label}.created`, req, entityType: label, entityId: String(doc._id), after: { name: doc.name } });
      res.status(201).json({ success: true, data: { item: doc } });
    },
    update: async (req: Request, res: Response) => {
      const doc = await Model.findById(req.params['id']);
      if (!doc) throw Errors.notFound(`${label} not found`);
      doc.set(req.body);
      await doc.save();
      await audit({ action: `${label}.updated`, req, entityType: label, entityId: String(doc._id), after: req.body });
      res.json({ success: true, data: { item: doc } });
    },
    deactivate: async (req: Request, res: Response) => {
      const doc = await Model.findById(req.params['id']);
      if (!doc) throw Errors.notFound(`${label} not found`);
      doc.isActive = false; // soft: products may still reference it
      await doc.save();
      await audit({ action: `${label}.deactivated`, req, entityType: label, entityId: String(doc._id) });
      res.status(204).end();
    },
  };
}
export const categoriesAdmin = taxonomy(Category, 'Category');
export const ingredientsAdmin = taxonomy(Ingredient, 'Ingredient');

/** Current stock sheet (CSV) for stock-taking. */
export async function exportInventory(req: Request, res: Response) {
  const products = await Product.find({ deletedAt: null, type: mongoose.trusted({ $ne: 'bundle' }) }, { name: 1, variants: 1 }).sort({ name: 1 }).lean();
  const rows = products.flatMap((p) => p.variants.map((v) => [p.name, v.label, v.sku, v.stock, v.lowStockThreshold ?? 5, v.isActive === false ? 'no' : 'yes']));
  await audit({ req, action: 'inventory.export', entityType: 'Product', after: { rows: rows.length } });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="inventory.csv"', 'Cache-Control': 'no-store' }).send(csv(['Product', 'Variant', 'SKU', 'Stock', 'Low-stock alert at', 'Active'], rows));
}
