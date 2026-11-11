import { Schema, model } from 'mongoose';
import { baseOptions, integerBdt } from './common.js';

const couponSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z0-9_-]{3,30}$/ },
    type: { type: String, enum: ['percent', 'fixed', 'free_delivery'], required: true },
    value: {
      type: Number,
      default: 0,
      validate: {
        validator(this: { type?: string }, v: number) {
          if (this.type === 'percent') return v > 0 && v <= 100;
          if (this.type === 'fixed') return Number.isInteger(v) && v > 0;
          return true;
        },
        message: 'Invalid coupon value for this coupon type',
      },
    },
    maxDiscount: { type: Number, validate: integerBdt },
    minOrderValue: { type: Number, default: 0, validate: integerBdt },
    startsAt: Date,
    expiresAt: Date,
    usageLimit: { type: Number, min: 1 },
    perCustomerLimit: { type: Number, min: 1, default: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    appliesToProducts: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    isActive: { type: Boolean, default: true },
  },
  baseOptions,
);

couponSchema.index({ code: 1 }, { unique: true });
couponSchema.index({ isActive: 1, expiresAt: 1 });

// Individual redemptions: unique (coupon, order) prevents double-counting the same order.
const redemptionSchema = new Schema(
  {
    coupon: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    phone: { type: String, required: true },
  },
  baseOptions,
);
redemptionSchema.index({ coupon: 1, order: 1 }, { unique: true });
redemptionSchema.index({ coupon: 1, phone: 1 });

export const Coupon = model('Coupon', couponSchema);
export const CouponRedemption = model('CouponRedemption', redemptionSchema);
