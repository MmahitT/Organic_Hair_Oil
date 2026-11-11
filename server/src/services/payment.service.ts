import mongoose from 'mongoose';
import { logger } from '../config/logger.js';
import { AppError, Errors } from '../middleware/errorHandler.js';
import { Product } from '../models/catalog.model.js';
import { Coupon, CouponRedemption } from '../models/coupon.model.js';
import { Order } from '../models/order.model.js';
import { Payment } from '../models/payment.model.js';
import { WebsiteSettings } from '../models/misc.model.js';
import { enqueueOrderNotification } from './notification.service.js';
import { restockOrder } from './inventory.service.js';

/**
 * Payment lifecycle (Cash on Delivery + manual bKash / Nagad / Rocket / bank transfer). No payment gateway is used.
 * Golden rules:
 *  - A customer's transaction ID, reference or screenshot is only a CLAIM. An order becomes `paid` only when an admin
 *    verifies it against the real bKash/bank record (`resolvePayment`).
 *  - Every state change is an atomic conditional update, so repeated or concurrent requests are harmless.
 *  - The system never moves money: refunds are records of money the owner already sent back.
 */

export const MANUAL_RESERVATION_HOURS = 24;
const OPEN_PAYMENT = ['initiated', 'failed', 'cancelled'] as const; // an unpaid order in one of these is still waiting for its payment
const trusted = <T>(v: T) => mongoose.trusted(v as object) as unknown as T;

/* ------------------------------------------------------------------ release (cancel / expiry) */

/** Returns what a not-fulfilled order was holding: stock (exact movements), sold count and coupon use. Caller owns the transaction and has already won the order-state change. */
export async function giveBackOrder(
  session: mongoose.ClientSession,
  o: { _id: mongoose.Types.ObjectId; items: { product: mongoose.Types.ObjectId; quantity: number }[]; coupon?: { couponId?: mongoose.Types.ObjectId | null } | null },
  note: string,
  reason: 'cancel' | 'return' = 'cancel',
): Promise<void> {
  await restockOrder(session, o._id, note, reason);
  for (const it of o.items) await Product.updateOne({ _id: it.product }, { $inc: { soldCount: -it.quantity } }, { session });
  if (o.coupon?.couponId) {
    const del = await CouponRedemption.deleteOne({ coupon: o.coupon.couponId, order: o._id }, { session });
    if (del.deletedCount) await Coupon.updateOne({ _id: o.coupon.couponId }, { $inc: { usedCount: -1 } }, { session });
  }
}

/**
 * Cancels an unpaid pending order and returns its stock and coupon use. The order-state change is the atomic gate:
 * only the single caller that flips pending→cancelled performs the restock, so this is safe to call repeatedly.
 */
export async function releaseOrder(orderId: mongoose.Types.ObjectId | string, paymentStatus: 'expired' | 'cancelled' | 'failed', reason: string): Promise<boolean> {
  const session = await mongoose.startSession();
  let released = false;
  try {
    await session.withTransaction(async () => {
      released = false;
      const o = await Order.findOneAndUpdate(
        { _id: orderId, status: 'pending', paymentStatus: trusted({ $in: [...OPEN_PAYMENT, 'pending'] }) },
        { $set: { status: 'cancelled', paymentStatus }, $unset: { reservationExpiresAt: '' }, $push: { statusHistory: { status: 'cancelled', at: new Date(), by: 'system', note: reason } } },
        { session, new: false },
      ).lean();
      if (!o) return;
      await giveBackOrder(session, o, reason);
      await Payment.updateMany({ order: o._id, status: 'initiated' }, { $set: { status: paymentStatus === 'expired' ? 'expired' : 'cancelled' }, $push: { events: { type: `released:${reason}`, at: new Date() } } }, { session });
      released = true;
    });
  } finally {
    await session.endSession();
  }
  if (released) logger.info({ orderId: String(orderId), reason }, 'Unpaid order released');
  return released;
}

/* ------------------------------------------------------------------ marking paid */

/**
 * Atomically marks a manual payment and its order paid. The order goes first (it must still be unpaid and open); if it
 * cannot take the payment the whole transaction rolls back and the admin is told why — nothing is half-applied.
 */
async function commitPaid(paymentId: mongoose.Types.ObjectId, patch: { verifiedBy: string; note: string; by: string }): Promise<void> {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      const p = await Payment.findOne({ _id: paymentId, provider: 'manual', status: 'pending' }, null, { session }).lean();
      if (!p) throw new AppError(409, 'CONFLICT', 'This payment was already decided by someone else. Reload and check.');
      const settings = await WebsiteSettings.findOne({ key: 'main' }, { 'orderSettings.autoConfirm': 1 }, { session }).lean();
      const autoConfirm = settings?.orderSettings?.autoConfirm === true;
      const o = await Order.findOneAndUpdate(
        { _id: p.order, paymentStatus: 'pending', status: trusted({ $in: ['pending', 'confirmed', 'processing'] }) },
        {
          $set: { paymentStatus: 'paid', payment: p._id, ...(autoConfirm && { status: 'confirmed' }) },
          $unset: { reservationExpiresAt: '' },
          $push: { statusHistory: { status: autoConfirm ? 'confirmed' : 'pending', at: now, by: patch.by, note: 'Payment verified' } },
        },
        { session },
      ).lean();
      if (!o) throw Errors.businessRule('The order is cancelled or no longer waiting for payment, so this payment cannot be verified.');
      const upd = await Payment.updateOne(
        { _id: p._id, status: 'pending' },
        { $set: { status: 'paid', ...(patch.note && { note: patch.note }), 'manual.verifiedBy': patch.verifiedBy, 'manual.verifiedAt': now }, $push: { events: { type: 'verified', at: now, by: patch.by, ...(patch.note && { note: patch.note }) } } },
        { session },
      );
      if (upd.matchedCount === 0) throw new AppError(409, 'CONFLICT', 'This payment was already decided by someone else. Reload and check.');
    });
  } finally { await session.endSession(); }
  const p = await Payment.findById(paymentId, { order: 1 }).lean();
  if (p) await enqueueOrderNotification(p.order, 'payment_received');
}

/* ------------------------------------------------------------------ manual bKash / Nagad / Rocket / bank */

export async function submitManualPayment(orderNo: string, input: { trxId: string; senderNumber?: string; senderName?: string; reference?: string }): Promise<void> {
  const order = await Order.findOne({ orderNo }).lean();
  if (!order || !order.paymentMethod.startsWith('manual_')) throw Errors.notFound('Order not found');
  const isBank = order.paymentMethod === 'manual_bank';
  if (!isBank && !input.senderNumber) throw new AppError(400, 'VALIDATION_ERROR', 'Please enter the number you sent the money from.', [{ path: 'senderNumber', message: 'Required' }]);
  if (order.status !== 'pending' || !(['initiated', 'failed', 'pending'] as string[]).includes(order.paymentStatus)) {
    throw new AppError(409, 'PAYMENT_NOT_ALLOWED', 'This order can no longer accept a payment reference.');
  }
  const now = new Date();
  try {
    // Submitting only records what the customer claims. The order stays unpaid until an admin verifies it (resolvePayment).
    const p = await Payment.findOneAndUpdate(
      { _id: order.payment, provider: 'manual', status: trusted({ $in: ['initiated', 'failed', 'pending'] }) },
      { $set: { status: 'pending', 'manual.trxId': input.trxId, 'manual.senderNumber': input.senderNumber ?? null, 'manual.senderName': input.senderName ?? null, 'manual.reference': input.reference ?? null, 'manual.submittedAt': now }, $push: { events: { type: 'manual_submitted', at: now, by: 'customer' } } },
    ).lean();
    if (!p) throw new AppError(409, 'PAYMENT_NOT_ALLOWED', 'This order can no longer accept a payment reference.');
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError(409, 'TRX_ALREADY_USED', 'This transaction ID has already been submitted. Please check it and try again.');
    throw err;
  }
  // Awaiting an admin: stop the unpaid-order timer so the order is not cancelled while the owner verifies.
  await Order.updateOne({ _id: order._id }, { $set: { paymentStatus: 'pending' }, $unset: { reservationExpiresAt: '' } });
}

/** Admin decision on a customer's payment claim: verify (after checking the real record) or reject. */
export async function resolvePayment(paymentId: string, approve: boolean, note: string, adminId: string, adminLabel = 'admin'): Promise<{ status: string }> {
  const p = await Payment.findById(paymentId).lean();
  if (!p) throw Errors.notFound('Payment not found');
  if (p.provider !== 'manual' || p.status !== 'pending') throw Errors.businessRule('This payment is not waiting for a decision');
  if (approve) {
    await commitPaid(p._id, { verifiedBy: adminId, note, by: adminLabel });
    return { status: 'paid' };
  }
  const upd = await Payment.updateOne({ _id: p._id, status: 'pending' }, { $set: { status: 'failed', note }, $push: { events: { type: 'rejected', at: new Date(), by: adminLabel, ...(note && { note }) } } });
  if (upd.matchedCount === 0) throw Errors.businessRule('This payment changed while you were reviewing it');
  // let the customer try again for a while, then the expiry job cleans up
  await Order.updateOne({ _id: p.order, status: 'pending', paymentStatus: 'pending' }, { $set: { paymentStatus: 'failed', reservationExpiresAt: new Date(Date.now() + MANUAL_RESERVATION_HOURS * 3600_000) } });
  return { status: 'failed' };
}

/**
 * Records a refund the owner has ALREADY sent back (bKash, bank, cash…). The system never moves money itself: this only
 * keeps the books and the customer-facing status honest. Atomic: two admins cannot refund more than was paid.
 */
export async function refundPayment(paymentId: string, amount: number | undefined, reason: string, adminId: string, adminLabel: string): Promise<{ status: string; refundedTotal: number }> {
  const session = await mongoose.startSession();
  let result: { status: string; refundedTotal: number } | null = null;
  try {
    await session.withTransaction(async () => {
      result = null;
      const p = await Payment.findById(paymentId, null, { session }).lean();
      if (!p) throw Errors.notFound('Payment not found');
      if (!(['paid', 'cod_collected', 'partially_refunded', 'refund_pending'] as string[]).includes(p.status)) throw Errors.businessRule('Only a verified (paid) payment can be refunded');
      const remaining = p.amount - (p.refundedTotal ?? 0);
      const amt = amount ?? remaining;
      if (amt < 1 || amt > remaining) throw Errors.businessRule(`The refund must be between ৳1 and ৳${remaining} (the amount still refundable).`);
      const now = new Date();
      const upd = await Payment.findOneAndUpdate(
        { _id: p._id, status: p.status, refundedTotal: p.refundedTotal ?? 0 }, // compare-and-swap on what we just read
        { $inc: { refundedTotal: amt }, $push: { refunds: { amount: amt, reason, by: adminId, at: now }, events: { type: 'refund_recorded', at: now, by: adminLabel, note: `৳${amt}: ${reason}` } } },
        { session, new: true },
      ).lean();
      if (!upd) throw new AppError(409, 'CONFLICT', 'This payment changed while you were refunding it. Reload and try again.');
      const status = upd.refundedTotal >= upd.amount ? 'refunded' : 'partially_refunded';
      await Payment.updateOne({ _id: p._id }, { $set: { status } }, { session });
      await Order.updateOne({ _id: p.order }, { $set: { paymentStatus: status } }, { session });
      result = { status, refundedTotal: upd.refundedTotal };
    });
  } finally { await session.endSession(); }
  return result!;
}

/* ------------------------------------------------------------------ background work */

/** Cancels prepaid orders nobody paid for within their window and gives the stock back. */
export async function expireStaleOrders(now = new Date()): Promise<{ released: number }> {
  const stale = await Order.find(
    { status: 'pending', paymentMethod: trusted({ $ne: 'cod' }), paymentStatus: trusted({ $in: [...OPEN_PAYMENT] }), reservationExpiresAt: trusted({ $lt: now }) },
    { _id: 1 },
  ).limit(100).lean();
  let released = 0;
  for (const o of stale) {
    try { if (await releaseOrder(o._id, 'expired', 'Payment window expired')) released++; } catch (err) {
      logger.warn({ orderId: String(o._id), err: (err as Error).message }, 'Could not expire order yet'); // try again next run
    }
  }
  return { released };
}
