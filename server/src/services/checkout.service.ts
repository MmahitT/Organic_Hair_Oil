import crypto from 'node:crypto';
import mongoose, { type ClientSession } from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { Product } from '../models/catalog.model.js';
import { Order } from '../models/order.model.js';
import { Payment } from '../models/payment.model.js';
import { isBlocked } from './customers.service.js';
import { InventoryMovement } from '../models/misc.model.js';
import { generateOrderNo } from '../utils/orderNo.js';
import { signOrderToken } from '../utils/tokens.js';
import { enqueueOrderNotification } from './notification.service.js';
import { redeemCoupon } from './coupon.service.js';
import { MANUAL_RESERVATION_HOURS } from './payment.service.js';
import { buildQuote, loadSettings, publicQuote, type Quote } from './quote.service.js';

export interface CheckoutInput {
  idempotencyKey: string;
  items: { productId: string; sku: string; qty: number }[];
  customer: { name: string; phone: string; email?: string; district: string; city: string; address: string; instructions?: string };
  paymentMethod: 'cod' | 'manual_bkash' | 'manual_nagad' | 'manual_rocket' | 'manual_bank';
  couponCode?: string;
  expectedTotal?: number;
  allowDuplicate?: boolean;
  source?: { utmSource?: string; utmMedium?: string; utmCampaign?: string; referrer?: string };
}
export interface CheckoutContext { userId?: string; ip?: string; userAgent?: string }

export interface CheckoutResult {
  replay: boolean;
  orderNo: string;
  status: string;
  paymentStatus: string;
  paymentMethod: CheckoutInput['paymentMethod'];
  total: number;
  orderToken: string;
}

const insufficient = (details: unknown) => new AppError(422, 'INSUFFICIENT_STOCK', 'Some items are no longer available in the quantity you chose. Please review your cart.', details);

export function cartSignature(items: { productId: string; sku: string; qty: number }[]): string {
  const merged = new Map<string, number>();
  for (const i of items) merged.set(`${i.productId}:${i.sku}`, (merged.get(`${i.productId}:${i.sku}`) ?? 0) + i.qty);
  return [...merged.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, q]) => `${k}x${q}`).join('|');
}

/**
 * Takes stock for one component inside the order transaction. A single conditional update ($gte) means two
 * concurrent orders can never both take the last unit; the surrounding transaction rolls back every previous
 * line if a later one fails. Products with allowBackorder take only what physically exists.
 */
async function consumeStock(session: ClientSession, orderId: mongoose.Types.ObjectId, productId: string, sku: string, qty: number) {
  const p = await Product.findOne({ _id: productId, deletedAt: null }, { forceOutOfStock: 1, allowBackorder: 1, variants: { $elemMatch: { sku } } }, { session }).lean();
  const v = p?.variants?.[0];
  if (!p || !v || p.forceOutOfStock) throw insufficient([{ productId, sku, available: 0 }]);
  const available = Math.max(0, v.stock - v.reservedStock);
  let take = qty;
  if (available < qty) {
    if (!p.allowBackorder) throw insufficient([{ productId, sku, available }]);
    take = Math.min(v.stock, qty);
  }
  if (take <= 0) return;
  const upd = await Product.updateOne(
    { _id: productId, deletedAt: null, variants: mongoose.trusted({ $elemMatch: { sku, stock: mongoose.trusted({ $gte: take }) } }) },
    { $inc: { 'variants.$.stock': -take } },
    { session },
  );
  if (upd.matchedCount === 0) throw insufficient([{ productId, sku, available: 0 }]);
  const after = await Product.findOne({ _id: productId }, { variants: { $elemMatch: { sku } } }, { session }).lean();
  if (after!.variants[0]!.stock < after!.variants[0]!.reservedStock) throw insufficient([{ productId, sku, available: 0 }]);
  await InventoryMovement.create([{ product: productId, sku, delta: -take, reason: 'order', order: orderId, by: 'customer', note: 'Order placed' }], { session });
}

async function uniqueOrderNo(session: ClientSession): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const n = generateOrderNo();
    if (!(await Order.exists({ orderNo: n }).session(session))) return n;
  }
  throw new AppError(500, 'INTERNAL', 'Could not allocate an order number. Please try again.');
}

const replayOf = (o: { orderNo: string; status: string; paymentStatus: string; paymentMethod: string; total: number }): CheckoutResult => ({
  replay: true, orderNo: o.orderNo, status: o.status, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod as CheckoutInput['paymentMethod'], total: o.total, orderToken: signOrderToken(o.orderNo),
});

type PaySettings = {
  payments?: {
    codEnabled?: boolean;
    manual?: { enabled?: boolean; bkash?: string | null; nagad?: string | null; rocket?: string | null } | null;
    bank?: { enabled?: boolean; accountNumber?: string | null } | null;
  } | null;
} | null;
const unavailable = (msg: string) => new AppError(422, 'PAYMENT_METHOD_UNAVAILABLE', msg);

/** Rejects a payment method the owner has not enabled (or that cannot work yet). */
function assertMethodAvailable(method: CheckoutInput['paymentMethod'], s: PaySettings) {
  if (method === 'cod') { if (s?.payments?.codEnabled === false) throw unavailable('Cash on Delivery is currently unavailable.'); return; }
  if (method === 'manual_bank') {
    if (!s?.payments?.bank?.enabled || !s.payments.bank.accountNumber) throw unavailable('Bank transfer is not available right now. Please choose another method.');
    return;
  }
  const key = method.replace('manual_', '') as 'bkash' | 'nagad' | 'rocket';
  if (!s?.payments?.manual?.enabled || !s.payments.manual[key]) throw unavailable('This payment method is not available right now. Please choose another method.');
}

export async function placeOrder(input: CheckoutInput, ctx: CheckoutContext = {}): Promise<CheckoutResult> {
  // 1. Idempotent replay: the same key always returns the same order and never touches stock again.
  const existing = await Order.findOne({ idempotencyKey: input.idempotencyKey }).lean();
  if (existing) return replayOf(existing);

  const settingsPre = await loadSettings();
  if (!settingsPre) throw new AppError(503, 'NOT_CONFIGURED', 'The shop is not configured yet. Please contact us.');
  assertMethodAvailable(input.paymentMethod, settingsPre);

  if (await isBlocked(input.customer.phone)) throw new AppError(403, 'ACCOUNT_BLOCKED', 'We could not accept this order online. Please contact us on WhatsApp.');

  // 2. Duplicate-submission guard (same phone + same cart within the configured window).
  const signature = cartSignature(input.items);
  const windowSec = settingsPre.orderSettings?.duplicateWindowSeconds ?? 120;
  if (!input.allowDuplicate && windowSec > 0) {
    const dup = await Order.findOne({ 'customer.phone': input.customer.phone, cartSignature: signature, createdAt: mongoose.trusted({ $gte: new Date(Date.now() - windowSec * 1000) }) }, { orderNo: 1 }).lean();
    if (dup) throw new AppError(409, 'DUPLICATE_ORDER', 'You placed an identical order a moment ago.', { orderNo: dup.orderNo });
  }

  const orderId = new mongoose.Types.ObjectId();
  const isCod = input.paymentMethod === 'cod';
  const session = await mongoose.startSession();
  let result!: CheckoutResult;
  try {
    await session.withTransaction(async () => {
      // 3. Authoritative pricing inside the transaction (same snapshot as the stock updates).
      const q: Quote = await buildQuote({ items: input.items, couponCode: input.couponCode, district: input.customer.district, phone: input.customer.phone }, { session });

      const bad = q.lines.filter((l) => l.unavailable || l.qty < l.requestedQty);
      if (bad.length) throw insufficient(bad.map((l) => ({ productId: l.productId, sku: l.sku, requested: l.requestedQty, available: l.maxQty })));
      if (input.couponCode && !q.coupon) throw new AppError(422, 'COUPON_INVALID', q.couponError?.message ?? 'This coupon cannot be used.', q.couponError);
      if (input.expectedTotal !== undefined && input.expectedTotal !== q.total) {
        throw new AppError(409, 'PRICE_CHANGED', 'Prices or delivery charges changed. Please review the updated total.', { quote: publicQuote(q) });
      }
      const codMax = settingsPre.payments?.codMaxAmount;
      if (input.paymentMethod === 'cod' && codMax != null && q.total > codMax) throw new AppError(422, 'COD_LIMIT', `Cash on Delivery is available for orders up to ৳${codMax}. Please contact us for larger orders.`);

      // 4. Stock (all-or-nothing) and coupon use.
      for (const e of q.stockPlan) await consumeStock(session, orderId, e.productId, e.sku, e.qty);
      if (q.coupon && q.couponResult?.valid) {
        if (!(await redeemCoupon(q.couponResult.couponId, orderId, input.customer.phone, session))) {
          throw new AppError(422, 'COUPON_INVALID', 'This coupon has reached its usage limit.', { reason: 'LIMIT_REACHED' });
        }
      }

      // 5. Order + payment snapshot.
      const orderNo = await uniqueOrderNo(session);
      const autoConfirm = settingsPre.orderSettings?.autoConfirm === true;
      // Prepaid orders are confirmed only once an admin verifies the payment (see payment.service).
      const status = autoConfirm && isCod ? 'confirmed' : 'pending';
      const now = new Date();
      const productDocs = await Product.find({ _id: mongoose.trusted({ $in: q.lines.map((l) => l.productId) }) }, { bundleItems: 1, name: 1, variants: 1 }, { session }).lean();
      const items = q.lines.map((l) => {
        const pd = productDocs.find((x) => String(x._id) === l.productId)!;
        const components = l.isBundle
          ? pd.bundleItems.map((b) => ({ product: b.product, sku: b.sku, name: '', quantity: b.quantity * l.qty }))
          : [{ product: pd._id, sku: l.sku, name: l.name, quantity: l.qty }];
        return { product: pd._id, variantSku: l.sku, name: l.name, image: l.image ?? undefined, unitPrice: l.unitPrice, quantity: l.qty, lineTotal: l.lineTotal, components };
      });
      // fill bundle component names for the packing snapshot
      const compIds = [...new Set(items.flatMap((i) => i.components.filter((c) => !c.name).map((c) => String(c.product))))];
      if (compIds.length) {
        const named = await Product.find({ _id: mongoose.trusted({ $in: compIds }) }, { name: 1 }, { session }).lean();
        for (const it of items) for (const c of it.components) if (!c.name) c.name = named.find((n) => String(n._id) === String(c.product))?.name ?? '';
      }

      const paymentId = new mongoose.Types.ObjectId();
      // Unpaid prepaid orders hold their stock only for a limited time; the expiry job then gives it back.
      const reservationExpiresAt = isCod ? undefined : new Date(now.getTime() + MANUAL_RESERVATION_HOURS * 3600_000);
      const paymentStatus = isCod ? 'cod_pending' : 'initiated';
      await Order.create([{
        _id: orderId, orderNo, idempotencyKey: input.idempotencyKey, cartSignature: signature, user: ctx.userId,
        customer: input.customer, items,
        subtotal: q.subtotal, productDiscount: q.productDiscount, couponDiscount: q.couponDiscount, deliveryFee: q.deliveryFee, total: q.total,
        coupon: q.coupon && q.couponResult?.valid ? { code: q.coupon.code, couponId: q.couponResult.couponId, type: q.coupon.type, value: q.couponResult.value } : undefined,
        deliveryZone: q.zone ? { zoneId: q.zone.key, name: q.zone.name } : undefined,
        paymentMethod: input.paymentMethod, paymentStatus, payment: paymentId, status, reservationExpiresAt,
        statusHistory: [{ status: 'pending', at: now, by: 'customer' }, ...(autoConfirm && isCod ? [{ status: 'confirmed' as const, at: now, by: 'system', note: 'Auto-confirmed' }] : [])],
        source: input.source,
        meta: { ipHash: ctx.ip ? crypto.createHash('sha256').update(`${ctx.ip}:${env.JWT_ACCESS_SECRET}`).digest('hex').slice(0, 16) : undefined, userAgent: ctx.userAgent?.slice(0, 300) },
      }], { session });
      await Payment.create([
        isCod ? { _id: paymentId, order: orderId, provider: 'cod', method: 'cod', tranId: `COD-${orderNo}`, amount: q.total, currency: 'BDT', status: 'cod_pending', events: [{ type: 'order_placed', at: now }] }
          : { _id: paymentId, order: orderId, provider: 'manual', method: input.paymentMethod.replace('manual_', ''), tranId: `${orderNo}-MANUAL`, amount: q.total, currency: 'BDT', status: 'initiated', events: [{ type: 'order_placed', at: now }] },
      ], { session });
      for (const l of q.lines) await Product.updateOne({ _id: l.productId }, { $inc: { soldCount: l.qty } }, { session });

      result = { replay: false, orderNo, status, paymentStatus, paymentMethod: input.paymentMethod, total: q.total, orderToken: signOrderToken(orderNo) };
    });
  } catch (err) {
    // Two identical requests racing: the loser hits the unique idempotencyKey index — return the winner's order.
    if ((err as { code?: number }).code === 11000 && JSON.stringify((err as { keyPattern?: unknown }).keyPattern ?? {}).includes('idempotencyKey')) {
      const won = await Order.findOne({ idempotencyKey: input.idempotencyKey }).lean();
      if (won) return replayOf(won);
    }
    throw err;
  } finally {
    await session.endSession();
  }
  logger.info({ orderNo: result.orderNo, total: result.total, method: input.paymentMethod }, 'Order placed');
  await enqueueOrderNotification(orderId, 'order_placed');
  return result;
}
