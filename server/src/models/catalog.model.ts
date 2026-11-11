import { Schema, Types, model, type InferSchemaType } from 'mongoose';
import { baseOptions, integerBdt, slugValidator } from './common.js';

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, validate: slugValidator },
    description: { type: String, maxlength: 500 },
    image: { url: String, publicId: String },
    parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  baseOptions,
);
categorySchema.index({ slug: 1 }, { unique: true });
export const Category = model('Category', categorySchema);

const ingredientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    nameBn: { type: String, trim: true, maxlength: 80 },
    slug: { type: String, required: true, validate: slugValidator },
    description: { type: String, maxlength: 500 },
    image: { url: String, publicId: String },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  baseOptions,
);
ingredientSchema.index({ name: 1 }, { unique: true });
ingredientSchema.index({ slug: 1 }, { unique: true });
export const Ingredient = model('Ingredient', ingredientSchema);

const variantSchema = new Schema(
  {
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    label: { type: String, required: true, trim: true, maxlength: 40 },
    sizeValue: { type: Number, min: 0 },
    sizeUnit: { type: String, enum: ['ml', 'g', 'pcs'] },
    regularPrice: { type: Number, required: true, validate: integerBdt },
    discountPrice: {
      type: Number,
      validate: [
        integerBdt,
        {
          validator(this: { regularPrice?: number }, v: number | null | undefined) {
            return v == null || (this.regularPrice !== undefined && v < this.regularPrice);
          },
          message: 'discountPrice must be lower than regularPrice',
        },
      ],
    },
    discountStart: Date,
    discountEnd: Date,
    stock: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    reservedStock: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true },
);

const imageSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: String,
    alt: { type: String, required: true, maxlength: 200 },
    isPrimary: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

export const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    nameBn: { type: String, trim: true, maxlength: 120 },
    slug: { type: String, required: true, validate: slugValidator },
    type: { type: String, enum: ['simple', 'bundle'], default: 'simple' },
    description: { type: String, maxlength: 5000 },
    descriptionBn: { type: String, maxlength: 5000 },
    shortDescription: { type: String, maxlength: 300 },
    shortDescriptionBn: { type: String, maxlength: 300 },
    category: { type: Schema.Types.ObjectId, ref: 'Category' },
    images: { type: [imageSchema], default: [] },
    variants: {
      type: [variantSchema],
      validate: { validator: (v: unknown[]) => v.length > 0, message: 'At least one variant is required' },
    },
    bundleItems: {
      type: [
        new Schema(
          {
            product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
            sku: { type: String, required: true, uppercase: true },
            quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
            isGift: { type: Boolean, default: false },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    freeDelivery: { type: Boolean, default: false },
    ingredients: {
      type: [new Schema({ ingredient: { type: Schema.Types.ObjectId, ref: 'Ingredient', required: true }, order: { type: Number, default: 0 } }, { _id: false })],
      default: [],
    },
    benefits: { type: [new Schema({ title: String, text: String, icon: String }, { _id: false })], default: [] },
    howToUse: { type: [new Schema({ step: Number, text: String }, { _id: false })], default: [] },
    visibility: { type: String, enum: ['draft', 'published', 'hidden'], default: 'draft' },
    forceOutOfStock: { type: Boolean, default: false },
    allowBackorder: { type: Boolean, default: false },
    maxPerOrder: { type: Number, min: 1 },
    relatedProducts: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    seo: { title: { type: String, maxlength: 70 }, description: { type: String, maxlength: 170 }, ogImage: String },
    ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    soldCount: { type: Number, default: 0, min: 0 },
    isFeatured: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  baseOptions,
);

productSchema.pre('validate', function (this: { type?: string; bundleItems?: unknown[]; invalidate: (p: string, m: string) => unknown }, next) {
  if (this.type === 'bundle' && (this.bundleItems?.length ?? 0) === 0) {
    this.invalidate('bundleItems', 'A bundle needs at least one component');
  }
  next();
});

productSchema.index({ slug: 1 }, { unique: true });
productSchema.index({ 'variants.sku': 1 }, { unique: true });
productSchema.index({ visibility: 1, isFeatured: 1 });
productSchema.index({ name: 'text', description: 'text' });

export const Product = model('Product', productSchema);
export type ProductId = Types.ObjectId;
export type ProductObj = InferSchemaType<typeof productSchema> & { _id: Types.ObjectId };
