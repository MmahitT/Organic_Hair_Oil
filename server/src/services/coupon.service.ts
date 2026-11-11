import mongoose, { type ClientSession } from 'mongoose';
import { Coupon, CouponRedemption } from '../models/coupon.model.js';

export type CouponReason = 'NOT_FOUND' | 'INACTIVE' | 'NOT_STARTED' | 'EXPIRED' | 'MIN_ORDER' | 'LIMIT_REACHED' | 'CUSTOMER_LIMIT' | 'NOT_APPLICABLE';

const MESSAGES: Record<CouponReason, string> = {
  NOT_FOUND: 'This coupon code is not valid.',
  INACTIVE: 'This coupon is not active.',
  NOT_STARTED: 'This coupon is not active yet.',
  EXPIRED: 'This coupon has expired.',
  MIN_ORDER: 'Your order does not reach the minimum amount for this coupon.',
  LIMIT_REACHED: 'This coupon has reached its usage limit.',
  CUSTOMER_LIMIT: 'You have already used this coupon.',
  NOT_APPLICABLE: 'This coupon does not apply to the items in your cart.',
};

export type CouponResult =
  | { valid: true; couponId: string; code: string; type: 'percent' | 'fixed' | 'free_delivery'; value: number; discount: number; freeDelivery: boolean }
  | { valid: false; reason: CouponReason; message: string };

export interface CouponContext {
  subtotalAfterProductDiscount: number;
  lines: { productId: string; lineTotal: number }[]; // after product discounts, live lines only
  phone?: string;
  now: Date;
  session?: ClientSession;
}

const fail = (reason: CouponReason): CouponResult => ({ valid: false, reason, message: MESSAGES[reason] });

/** Pure rule evaluation against current data. Race-safe redemption happens in `redeemCoupon`. */
export async function evaluateCoupon(rawCode: string, ctx: CouponContext): Promise<CouponResult> {
  const code = rawCode.trim().toUpperCase();
  const c = await Coupon.findOne({ code }, null, { session: ctx.session }).lean();
  if (!c) return fail('NOT_FOUND');
  if (!c.isActive) return fail('INACTIVE');
  if (c.startsAt && c.startsAt > ctx.now) return fail('NOT_STARTED');
  if (c.expiresAt && c.expiresAt < ctx.now) return fail('EXPIRED');
  if (c.minOrderValue && ctx.subtotalAfterProductDiscount < c.minOrderValue) return fail('MIN_ORDER');
  if (c.usageLimit != null && c.usedCount >= c.usageLimit) return fail('LIMIT_REACHED');

  if (ctx.phone && c.perCustomerLimit != null) {
    const used = await CouponRedemption.countDocuments({ coupon: c._id, phone: ctx.phone }).session(ctx.session ?? null);
    if (used >= c.perCustomerLimit) return fail('CUSTOMER_LIMIT');
  }

  const restricted = c.appliesToProducts.map(String);
  const eligible = restricted.length ? ctx.lines.filter((l) => restricted.includes(l.productId)) : ctx.lines;
  if (eligible.length === 0) return fail('NOT_APPLICABLE');
  const eligibleTotal = eligible.reduce((s, l) => s + l.lineTotal, 0);

  let discount = 0;
  if (c.type === 'percent') {
    discount = Math.floor((eligibleTotal * c.value) / 100);
    if (c.maxDiscount != null) discount = Math.min(discount, c.maxDiscount);
  } else if (c.type === 'fixed') {
    discount = Math.min(c.value, eligibleTotal);
  }
  discount = Math.min(discount, ctx.subtotalAfterProductDiscount);
  return { valid: true, couponId: String(c._id), code: c.code, type: c.type, value: c.value, discount, freeDelivery: c.type === 'free_delivery' };
}

/**
 * Atomically claims one use of the coupon (usedCount < usageLimit enforced in the update filter itself) and records
 * the redemption. Must run inside the order transaction so a failed order never consumes a coupon use.
 */
export async function redeemCoupon(couponId: string, orderId: mongoose.Types.ObjectId, phone: string, session: ClientSession): Promise<boolean> {
  const res = await Coupon.updateOne(
    {
      _id: couponId,
      isActive: true,
      // $expr lets the limit check compare two fields of the same document atomically
      $expr: mongoose.trusted({ $or: [{ $eq: [{ $ifNull: ['$usageLimit', null] }, null] }, { $lt: ['$usedCount', '$usageLimit'] }] }) as never,
    },
    { $inc: { usedCount: 1 } },
    { session },
  );
  if (res.matchedCount === 0) return false;
  await CouponRedemption.create([{ coupon: couponId, order: orderId, phone }], { session });
  return true;
}
