import { z } from 'zod';

const money = z.number().int().min(0).max(1_000_000);
const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');
// Only https URLs (Cloudinary etc.) or our own /images/ paths. Blocks javascript:, data:, http: URLs.
const imageUrl = z.string().trim().max(600).regex(/^(https:\/\/|\/images\/)/, 'Image URL must start with https:// or /images/');
const slug = z.string().trim().toLowerCase().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens');
const text = (max: number) => z.string().trim().max(max);

const variantFields = {
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,39}$/, 'SKU: 2-40 letters, numbers, - or _'),
  label: z.string().trim().min(1).max(40),
  sizeValue: z.number().min(0).max(100000).optional(),
  sizeUnit: z.enum(['ml', 'g', 'pcs']).optional(),
  regularPrice: money,
  discountPrice: money.nullable().optional(),
  discountStart: z.coerce.date().nullable().optional(),
  discountEnd: z.coerce.date().nullable().optional(),
  lowStockThreshold: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
};
export const variantCreate = z.object({ ...variantFields, stock: z.number().int().min(0).max(100000).optional() });
/** Stock can never be edited through the product form — it must go through the audited inventory endpoint. */
export const variantUpdate = z.strictObject(variantFields);

const image = z.object({ url: imageUrl, publicId: text(200).optional(), alt: z.string().trim().min(1).max(200), isPrimary: z.boolean().optional(), order: z.number().int().min(0).max(100).optional() });

const base = {
  name: z.string().trim().min(2).max(120),
  nameBn: text(120).optional(),
  slug: slug.optional(),
  description: text(5000).optional(), // plain text (no HTML is stored or rendered => no stored-XSS surface)
  descriptionBn: text(5000).optional(),
  shortDescription: text(300).optional(),
  shortDescriptionBn: text(300).optional(),
  category: objectId.nullable().optional(),
  images: z.array(image).max(12).optional(),
  bundleItems: z.array(z.object({ product: objectId, sku: variantFields.sku, quantity: z.number().int().min(1).max(10), isGift: z.boolean().optional() })).max(10).optional(),
  freeDelivery: z.boolean().optional(),
  ingredients: z.array(z.object({ ingredient: objectId, order: z.number().int().min(0).max(100).optional() })).max(30).optional(),
  benefits: z.array(z.object({ title: text(80), text: text(300), icon: text(40).optional() })).max(8).optional(),
  howToUse: z.array(z.object({ step: z.number().int().min(1).max(20), text: text(300) })).max(10).optional(),
  visibility: z.enum(['draft', 'published', 'hidden']).optional(),
  forceOutOfStock: z.boolean().optional(),
  allowBackorder: z.boolean().optional(),
  maxPerOrder: z.number().int().min(1).max(100).nullable().optional(),
  relatedProducts: z.array(objectId).max(10).optional(),
  seo: z.object({ title: text(70).optional(), description: text(170).optional(), ogImage: imageUrl.optional() }).optional(),
  isFeatured: z.boolean().optional(),
};

export const createProductSchema = z
  .object({ ...base, type: z.enum(['simple', 'bundle']).default('simple'), variants: z.array(variantCreate).min(1).max(10) })
  .superRefine((v, ctx) => {
    if (v.type === 'bundle' && !(v.bundleItems?.length)) ctx.addIssue({ code: 'custom', path: ['bundleItems'], message: 'A bundle needs at least one component' });
    if (v.type === 'simple' && v.bundleItems?.length) ctx.addIssue({ code: 'custom', path: ['bundleItems'], message: 'Only bundles can have components' });
    const skus = v.variants.map((x) => x.sku);
    if (new Set(skus).size !== skus.length) ctx.addIssue({ code: 'custom', path: ['variants'], message: 'Duplicate SKU in this product' });
  });

export const updateProductSchema = z
  .object({ ...base, variants: z.array(variantUpdate).min(1).max(10).optional() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const idParam = z.object({ id: objectId });
export const inventoryParams = z.object({ productId: objectId, sku: variantFields.sku });

export const adjustStockSchema = z.union([
  z.object({ delta: z.number().int().min(-100000).max(100000).refine((n) => n !== 0, 'Delta cannot be 0'), note: z.string().trim().min(3, 'Please give a reason').max(200) }),
  z.object({ set: z.number().int().min(0).max(100000), note: z.string().trim().min(3, 'Please give a reason').max(200) }),
]);

export const pageQuery = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });

export const publicListQuery = pageQuery.extend({ q: z.string().trim().max(80).optional(), category: z.string().trim().max(80).optional() });
export const adminListQuery = pageQuery.extend({
  q: z.string().trim().max(80).optional(),
  visibility: z.enum(['draft', 'published', 'hidden']).optional(),
  type: z.enum(['simple', 'bundle']).optional(),
  archived: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});
export const movementsQuery = pageQuery.extend({ productId: objectId.optional(), sku: z.string().trim().max(40).optional() });
export const slugParam = z.object({ slug: slug });

const taxonomyBase = {
  name: z.string().trim().min(2).max(80),
  nameBn: text(80).optional(),
  slug: slug.optional(),
  description: text(500).optional(),
  order: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
  image: z.object({ url: imageUrl, publicId: text(200).optional() }).optional(),
};
export const taxonomyCreate = z.object(taxonomyBase);
export const taxonomyUpdate = z.object(taxonomyBase).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
