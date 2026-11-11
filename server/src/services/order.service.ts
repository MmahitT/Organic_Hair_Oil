import mongoose from 'mongoose';
import { AppError, Errors } from '../middleware/errorHandler.js';
import { Order } from '../models/order.model.js';
import { Payment } from '../models/payment.model.js';
import { WebsiteSettings } from '../models/misc.model.js';
import { restockOrder } from './inventory.service.js';
import { enqueueOrderNotification, STATUS_TEMPLATE } from './notification.service.js';
import { giveBackOrder } from './payment.service.js';
import { Product } from '../models/catalog.model.js';
import { normalizeBdPhone } from '../utils/phone.js';
import { verifyOrderToken } from '../utils/tokens.js';

const trusted = <T>(v: T) => mongoose.trusted(v as object) as unknown as T;

/** Forward-only workflow. Cancelling and returning have their own rules (stock, refunds) and endpoints. */
export const NEXT: Record<string, string[]> = {
  pending: ['confirmed'],
  confirmed: ['processing', 'shipped'],
  processing: ['shipped'],
  shipped: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
  delivered: [], cancelled: [], returned: [],
};
export const CANCELLABLE = ['pending', 'confirmed', 'processing'];
export const RETURNABLE = ['shipped', 'out_for_delivery', 'delivered'];

type Actor = { id: string; label: string };
const hist = (status: string, by: string, note?: string) => ({ status, at: new Date(), by, ...(note ? { note } : {}) });

export async function changeStatus(orderId: string, to: string, note: string | undefined, by: Actor) {
  const o = await Order.findById(orderId).lean();
  if (!o) throw Errors.notFound('Order not found');
  if (!NEXT[o.status]?.includes(to)) throw new AppError(422, 'INVALID_TRANSITION', `An order that is "${o.status.replace(/_/g, ' ')}" cannot move to "${to.replace(/_/g, ' ')}".`, { allowed: NEXT[o.status] ?? [] });
  if (o.paymentMethod !== 'cod' && o.paymentStatus !== 'paid') {
    throw new AppError(422, 'PAYMENT_REQUIRED', 'This order has not been paid yet. Confirm the payment first (Admin → Payments).');
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const upd = await Order.findOneAndUpdate(
        { _id: o._id, status: o.status },
        {
          $set: { status: to, ...(to === 'delivered' && { deliveredAt: new Date() }), ...(to === 'delivered' && o.paymentStatus === 'cod_pending' && { paymentStatus: 'cod_collected' }), ...(RETURNABLE.includes(to) && o.cancellation?.status === 'requested' && { 'cancellation.status': 'rejected', 'cancellation.resolvedBy': 'system' }) },
          $push: { statusHistory: hist(to, by.label, note) },
        },
        { session },
      ).lean();
      if (!upd) throw new AppError(409, 'CONFLICT', 'This order was changed by someone else. Reload and try again.');
      if (to === 'delivered' && o.paymentStatus === 'cod_pending') await Payment.updateOne({ order: o._id, provider: 'cod', status: 'cod_pending' }, { $set: { status: 'cod_collected' }, $push: { events: { type: 'cod_collected', at: new Date() } } }, { session });
    });
  } finally { await session.endSession(); }
  const tpl = STATUS_TEMPLATE[to];
  if (tpl) await enqueueOrderNotification(o._id, tpl);
  return { status: to };
}

/** Where the money stands when an order is stopped: paid money must be refunded by hand (gateway panel / bKash), so it is flagged. */
function paymentAfterStop(ps: string): string {
  if (ps === 'paid' || ps === 'cod_collected') return 'refund_pending';
  return 'cancelled';
}

async function settlePaymentRows(session: mongoose.ClientSession, orderId: mongoose.Types.ObjectId, ps: string) {
  const next = paymentAfterStop(ps);
  const from = next === 'refund_pending' ? ['paid', 'cod_collected'] : next === 'cancelled' ? ['initiated', 'pending', 'failed', 'cod_pending'] : [];
  if (from.length) await Payment.updateMany({ order: orderId, status: trusted({ $in: from }) }, { $set: { status: next }, $push: { events: { type: `order_stopped:${next}`, at: new Date() } } }, { session });
}

export async function cancelOrder(orderId: string, reason: string, by: Actor) {
  const o = await Order.findById(orderId).lean();
  if (!o) throw Errors.notFound('Order not found');
  if (!CANCELLABLE.includes(o.status)) throw new AppError(422, 'INVALID_TRANSITION', 'Only orders that have not shipped can be cancelled. Use "Process return" for shipped orders.');
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const upd = await Order.findOneAndUpdate(
        { _id: o._id, status: trusted({ $in: CANCELLABLE }), paymentStatus: o.paymentStatus },
        { $set: { status: 'cancelled', paymentStatus: paymentAfterStop(o.paymentStatus), 'cancellation.status': 'approved', 'cancellation.resolvedBy': by.label, ...(o.cancellation?.reason ? {} : { 'cancellation.reason': reason }) }, $unset: { reservationExpiresAt: '' }, $push: { statusHistory: hist('cancelled', by.label, reason) } },
        { session },
      ).lean();
      if (!upd) throw new AppError(409, 'CONFLICT', 'This order was changed by someone else. Reload and try again.');
      await giveBackOrder(session, o, `Order cancelled: ${reason}`.slice(0, 200));
      await settlePaymentRows(session, o._id, o.paymentStatus);
    });
  } finally { await session.endSession(); }
  await enqueueOrderNotification(o._id, 'order_cancelled');
  return { status: 'cancelled', refundNeeded: paymentAfterStop(o.paymentStatus) === 'refund_pending' };
}

/** Parcel came back (failed delivery) or the customer returned it. Restocking is the admin's call: goods may be unsellable. */
export async function processReturn(orderId: string, restock: boolean, note: string, by: Actor) {
  const o = await Order.findById(orderId).lean();
  if (!o) throw Errors.notFound('Order not found');
  if (!RETURNABLE.includes(o.status)) throw new AppError(422, 'INVALID_TRANSITION', 'Only shipped or delivered orders can be returned.');
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const upd = await Order.findOneAndUpdate(
        { _id: o._id, status: trusted({ $in: RETURNABLE }), paymentStatus: o.paymentStatus },
        { $set: { status: 'returned', paymentStatus: paymentAfterStop(o.paymentStatus), 'returnInfo.status': 'completed', 'returnInfo.restock': restock, 'returnInfo.resolvedBy': by.label }, $push: { statusHistory: hist('returned', by.label, `${restock ? 'Restocked' : 'Not restocked'}${note ? `: ${note}` : ''}`) } },
        { session },
      ).lean();
      if (!upd) throw new AppError(409, 'CONFLICT', 'This order was changed by someone else. Reload and try again.');
      if (restock) {
        await restockOrder(session, o._id, 'Order returned', 'return');
        for (const it of o.items) await Product.updateOne({ _id: it.product }, { $inc: { soldCount: -it.quantity } }, { session });
      }
      await settlePaymentRows(session, o._id, o.paymentStatus);
    });
  } finally { await session.endSession(); }
  return { status: 'returned', refundNeeded: paymentAfterStop(o.paymentStatus) === 'refund_pending' };
}

/* ---------------------------------------------------------------- customer requests */

type OrderDoc = NonNullable<Awaited<ReturnType<typeof findOrderForCustomer>>>;

/** One generic failure for every way the credentials can be wrong (no enumeration of order numbers). */
export const notFoundForCustomer = () => new AppError(404, 'ORDER_NOT_FOUND', 'We could not find an order with those details. Please check the order number and phone number.');

export async function findOrderForCustomer(a: { orderNo: string; phone?: string; token?: string }) {
  const o = await Order.findOne({ orderNo: a.orderNo }).lean();
  const phone = a.phone ? normalizeBdPhone(a.phone) : null;
  const ok = o && ((a.token && verifyOrderToken(a.token) === o.orderNo) || (phone && o.customer?.phone === phone));
  if (!o || !ok) throw notFoundForCustomer();
  return o;
}

export async function requestCancellation(o: OrderDoc, reason: string) {
  if (!CANCELLABLE.includes(o.status)) throw new AppError(422, 'NOT_ALLOWED', 'This order can no longer be cancelled online. Please message us on WhatsApp.');
  if (o.cancellation?.status === 'requested') throw new AppError(409, 'ALREADY_REQUESTED', 'You already asked to cancel this order. We will contact you soon.');
  const upd = await Order.updateOne({ _id: o._id, status: trusted({ $in: CANCELLABLE }), 'cancellation.status': trusted({ $ne: 'requested' }) }, { $set: { cancellation: { requestedAt: new Date(), reason, status: 'requested' } }, $push: { statusHistory: hist(o.status, 'customer', 'Cancellation requested') } });
  if (upd.matchedCount === 0) throw new AppError(409, 'CONFLICT', 'This order changed. Please check its status and try again.');
}

export async function returnWindowDays(): Promise<number | null> {
  const s = await WebsiteSettings.findOne({ key: 'main' }, { 'orderSettings.returnWindowDays': 1 }).lean();
  return s?.orderSettings?.returnWindowDays ?? null;
}

export function canReturn(o: { status: string; deliveredAt?: Date | null; returnInfo?: { status?: string | null } | null }, days: number | null, now = Date.now()): boolean {
  if (o.status !== 'delivered' || days == null || !o.deliveredAt) return false;
  if (o.returnInfo?.status) return false;
  return now - o.deliveredAt.getTime() <= days * 86_400_000;
}

export async function requestReturn(o: OrderDoc, reason: string) {
  const days = await returnWindowDays();
  if (days == null) throw new AppError(422, 'NOT_ALLOWED', 'Please message us on WhatsApp to arrange a return.');
  if (o.returnInfo?.status) throw new AppError(409, 'ALREADY_REQUESTED', 'You already asked to return this order. We will contact you soon.');
  if (!canReturn(o, days)) throw new AppError(422, 'NOT_ALLOWED', `Returns are accepted within ${days} day${days === 1 ? '' : 's'} of delivery.`);
  const upd = await Order.updateOne({ _id: o._id, status: 'delivered', 'returnInfo.status': trusted({ $exists: false }) }, { $set: { returnInfo: { requestedAt: new Date(), reason, status: 'requested' } }, $push: { statusHistory: hist('delivered', 'customer', 'Return requested') } });
  if (upd.matchedCount === 0) throw new AppError(409, 'ALREADY_REQUESTED', 'You already asked to return this order.');
}

/** Admin decision on a customer's request. Approving a cancellation cancels the order; approving a return only agrees to it (pickup, then "Process return"). */
export async function resolveRequest(orderId: string, kind: 'cancellation' | 'return', approve: boolean, note: string, by: Actor) {
  const o = await Order.findById(orderId).lean();
  if (!o) throw Errors.notFound('Order not found');
  if (kind === 'cancellation') {
    if (o.cancellation?.status !== 'requested') throw Errors.businessRule('There is no open cancellation request');
    if (approve) return cancelOrder(orderId, o.cancellation.reason ?? 'Cancelled at customer request', by);
    await Order.updateOne({ _id: o._id, 'cancellation.status': 'requested' }, { $set: { 'cancellation.status': 'rejected', 'cancellation.resolvedBy': by.label }, $push: { statusHistory: hist(o.status, by.label, `Cancellation request declined${note ? `: ${note}` : ''}`) } });
    return { status: o.status };
  }
  if (o.returnInfo?.status !== 'requested') throw Errors.businessRule('There is no open return request');
  await Order.updateOne({ _id: o._id, 'returnInfo.status': 'requested' }, { $set: { 'returnInfo.status': approve ? 'approved' : 'rejected', 'returnInfo.resolvedBy': by.label }, $push: { statusHistory: hist(o.status, by.label, `Return request ${approve ? 'approved' : 'declined'}${note ? `: ${note}` : ''}`) } });
  return { status: o.status };
}

/* ---------------------------------------------------------------- what customers may see */

export function presentOrderPublic(o: OrderDoc, days: number | null) {
  return {
    orderNo: o.orderNo, status: o.status, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod, createdAt: o.createdAt,
    // Only status + time: internal notes and who/why stay private.
    timeline: o.statusHistory.filter((h, i, a) => i === 0 || h.status !== a[i - 1]!.status).map((h) => ({ status: h.status, at: h.at })),
    items: o.items.map((i) => ({ productId: String(i.product), components: i.components.map((c) => String(c.product)), name: i.name, image: i.image ?? null, unitPrice: i.unitPrice, quantity: i.quantity, lineTotal: i.lineTotal })),
    subtotal: o.subtotal, productDiscount: o.productDiscount, couponDiscount: o.couponDiscount, deliveryFee: o.deliveryFee, total: o.total,
    deliveryZone: o.deliveryZone?.name ?? null,
    courier: o.courier?.name || o.courier?.trackingNo ? { name: o.courier?.name ?? null, trackingNo: o.courier?.trackingNo ?? null } : null,
    customer: { firstName: o.customer!.name.split(' ')[0], phoneMasked: `${o.customer!.phone.slice(0, 3)}*****${o.customer!.phone.slice(-3)}`, district: o.customer!.district },
    canCancel: CANCELLABLE.includes(o.status) && o.cancellation?.status !== 'requested',
    cancellationRequested: o.cancellation?.status === 'requested',
    canReturn: canReturn(o, days),
    returnStatus: o.returnInfo?.status ?? null,
  };
}
