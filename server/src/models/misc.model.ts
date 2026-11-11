import { Schema, model } from 'mongoose';
import { BD_PHONE_REGEX } from '../utils/phone.js';
import { baseOptions, integerBdt } from './common.js';

const addressSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    label: { type: String, maxlength: 40 },
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, match: BD_PHONE_REGEX },
    district: { type: String, required: true },
    city: { type: String, required: true },
    address: { type: String, required: true, minlength: 10, maxlength: 300 },
    isDefault: { type: Boolean, default: false },
  },
  baseOptions,
);
addressSchema.index({ user: 1 });
export const Address = model('Address', addressSchema);

const notificationSchema = new Schema(
  {
    channel: { type: String, enum: ['email', 'sms', 'whatsapp', 'inapp'], required: true },
    to: { type: String, required: true },
    template: { type: String, required: true },
    payload: Schema.Types.Mixed,
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    status: { type: String, enum: ['queued', 'sent', 'failed'], default: 'queued' },
    attempts: { type: Number, default: 0, min: 0 },
    lastError: String,
    providerMessageId: String,
    sentAt: Date,
  },
  baseOptions,
);
notificationSchema.index({ status: 1, createdAt: 1 });
export const Notification = model('Notification', notificationSchema);

const zoneSchema = new Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    districts: { type: [String], default: [] },
    fee: { type: Number, required: true, validate: integerBdt },
    freeOver: { type: Number, validate: integerBdt },
    etaDays: String,
    active: { type: Boolean, default: true },
  },
  { _id: false },
);

// Singleton document (key = 'main'). Content, business info, delivery, payment toggles, SEO, flags.
const settingsSchema = new Schema(
  {
    key: { type: String, required: true, default: 'main' },
    business: {
      name: { type: String, default: 'Beauty Organic Hair Oil' },
      legalName: String,
      logo: { url: String, publicId: String },
      phone: String,
      whatsapp: String,
      email: String,
      address: String,
      social: { facebook: String, instagram: String, youtube: String, tiktok: String },
    },
    currency: { type: String, enum: ['BDT'], default: 'BDT' },
    announcement: { text: String, textBn: String, link: String, active: { type: Boolean, default: true }, expiresAt: Date },
    content: { type: Schema.Types.Mixed, default: {} }, // hero, benefits, faq, offers, trust badges, footer
    delivery: { zones: { type: [zoneSchema], default: [] }, defaultZoneKey: { type: String, default: 'outside_rangpur' } },
    payments: {
      codEnabled: { type: Boolean, default: true },
      codMaxAmount: { type: Number, validate: integerBdt },
      // Manual mobile-money (send money to the owner's number). Numbers and instructions are edited in the admin, never in code.
      manual: {
        enabled: { type: Boolean, default: false }, bkash: String, nagad: String, rocket: String,
        instructions: { bkash: { type: String, maxlength: 500 }, nagad: { type: String, maxlength: 500 }, rocket: { type: String, maxlength: 500 } },
      },
      bank: { enabled: { type: Boolean, default: false }, bankName: { type: String, maxlength: 80 }, accountName: { type: String, maxlength: 80 }, accountNumber: { type: String, maxlength: 40 }, branch: { type: String, maxlength: 80 }, instructions: { type: String, maxlength: 500 } },
    },
    orderSettings: {
      reservationMinutes: { type: Number, default: 30, min: 5 },
      returnWindowDays: { type: Number, min: 0 },
      autoConfirm: { type: Boolean, default: false },
      duplicateWindowSeconds: { type: Number, default: 120, min: 0 },
    },
    seo: { title: String, description: String, titleBn: String, descriptionBn: String, ogImage: String },
    // Tracking IDs are only loaded in a visitor's browser after they consent (see the storefront consent banner).
    analytics: { ga4Id: String, metaPixelId: String },
    // Owner-written (or approved) policy text, Markdown. Empty = the draft template is shown. `legalReviewed` = owner confirmed the wording.
    legalPages: { privacy: String, terms: String, refund: String, shipping: String },
    legalReviewed: { type: Boolean, default: false },
    legalUpdatedAt: Date,
    featuredProductId: { type: Schema.Types.ObjectId, ref: 'Product' },
    featureFlags: { multiProductCatalogEnabled: { type: Boolean, default: true } },
  },
  baseOptions,
);
settingsSchema.index({ key: 1 }, { unique: true });
export const WebsiteSettings = model('WebsiteSettings', settingsSchema);

const auditSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId },
    actorKind: { type: String, enum: ['admin', 'user', 'system'], default: 'system' },
    role: String,
    action: { type: String, required: true },
    entityType: String,
    entityId: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    ip: String,
    userAgent: { type: String, maxlength: 300 },
  },
  { ...baseOptions, timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ entityType: 1, entityId: 1 });
auditSchema.index({ createdAt: -1 });
auditSchema.index({ actor: 1, createdAt: -1 });
export const AuditLog = model('AuditLog', auditSchema);

const counterSchema = new Schema({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } });
export const Counter = model('Counter', counterSchema);

const movementSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, required: true },
    delta: { type: Number, required: true, validate: Number.isInteger },
    reason: { type: String, enum: ['order', 'cancel', 'return', 'manual', 'reservation', 'reservation_release'], required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    by: String,
    note: String,
  },
  { ...baseOptions, timestamps: { createdAt: true, updatedAt: false } },
);
movementSchema.index({ product: 1, sku: 1, createdAt: -1 });
export const InventoryMovement = model('InventoryMovement', movementSchema);

/**
 * Owner's notes and block flag for a customer, keyed by phone. Customers are otherwise derived from orders (guest
 * checkout has no account), so this small collection is the only place customer-level admin data lives.
 */
const customerSchema = new Schema(
  {
    phone: { type: String, required: true, match: BD_PHONE_REGEX },
    notes: { type: String, maxlength: 1000 },
    isBlocked: { type: Boolean, default: false },
    blockedAt: Date,
    blockedBy: String,
  },
  baseOptions,
);
customerSchema.index({ phone: 1 }, { unique: true });
export const Customer = model('Customer', customerSchema);

/** Messages from the public contact form (stored for the owner; never emailed automatically). */
const messageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, match: BD_PHONE_REGEX },
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
    message: { type: String, required: true, trim: true, maxlength: 1500 },
    status: { type: String, enum: ['new', 'read', 'done'], default: 'new' },
    ipHash: String,
  },
  baseOptions,
);
messageSchema.index({ status: 1, createdAt: -1 });
export const ContactMessage = model('ContactMessage', messageSchema);
