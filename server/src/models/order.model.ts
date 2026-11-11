import { Schema, model } from 'mongoose';
import { BD_PHONE_REGEX } from '../utils/phone.js';
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, baseOptions, integerBdt } from './common.js';

const money = { type: Number, required: true, default: 0, validate: integerBdt };

const itemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantSku: { type: String, required: true },
    name: { type: String, required: true },
    image: String,
    unitPrice: money,
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    lineTotal: money,
    isGift: { type: Boolean, default: false },
    // Snapshot of what must be packed (bundle parts / the product itself) so fulfilment never depends on today's catalogue.
    components: {
      type: [new Schema({ product: { type: Schema.Types.ObjectId, ref: 'Product', required: true }, sku: String, name: String, quantity: { type: Number, min: 1 } }, { _id: false })],
      default: [],
    },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNo: { type: String, required: true, match: /^HO-\d{6}-[A-Z0-9]{4,6}$/ },
    idempotencyKey: { type: String, maxlength: 64 },
    cartSignature: { type: String, maxlength: 400 },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    customer: {
      name: { type: String, required: true, trim: true, maxlength: 80 },
      phone: { type: String, required: true, match: BD_PHONE_REGEX },
      email: { type: String, lowercase: true, trim: true },
      district: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      address: { type: String, required: true, trim: true, minlength: 10, maxlength: 300 },
      instructions: { type: String, maxlength: 300 },
    },
    items: { type: [itemSchema], validate: { validator: (v: unknown[]) => v.length > 0, message: 'Order needs at least one item' } },
    subtotal: money,
    productDiscount: money,
    couponDiscount: money,
    deliveryFee: money,
    total: money,
    // NOTE: a nested key literally called `type` must be declared as { type: String } or Mongoose treats it as the type of `coupon`.
    coupon: { code: String, couponId: { type: Schema.Types.ObjectId, ref: 'Coupon' }, type: { type: String }, value: Number },
    deliveryZone: { zoneId: String, name: String },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, required: true, default: 'pending' },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment' },
    status: { type: String, enum: ORDER_STATUSES, required: true, default: 'pending' },
    statusHistory: {
      type: [new Schema({ status: { type: String, enum: ORDER_STATUSES, required: true }, at: { type: Date, default: Date.now }, by: String, note: String }, { _id: false })],
      default: [],
    },
    courier: { name: String, trackingNo: String, consignmentId: String },
    cancellation: { requestedAt: Date, reason: String, status: { type: String, enum: ['requested', 'approved', 'rejected'] }, resolvedBy: String },
    returnInfo: { requestedAt: Date, reason: String, status: { type: String, enum: ['requested', 'approved', 'rejected', 'completed'] }, resolvedBy: String, restock: Boolean },
    notes: { type: String, maxlength: 2000 },
    source: { utmSource: String, utmMedium: String, utmCampaign: String, referrer: String },
    meta: { ipHash: String, userAgent: { type: String, maxlength: 300 } },
    reservationExpiresAt: Date,
    deliveredAt: Date,
  },
  baseOptions,
);

orderSchema.index({ orderNo: 1 }, { unique: true });
orderSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
orderSchema.index({ 'customer.phone': 1, cartSignature: 1, createdAt: -1 });
orderSchema.index({ 'customer.phone': 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ user: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ reservationExpiresAt: 1 }, { sparse: true });

export const Order = model('Order', orderSchema);
