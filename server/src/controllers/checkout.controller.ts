import type { Request, Response } from 'express';
import { DISTRICTS } from '../constants/districts.js';
import { Errors } from '../middleware/errorHandler.js';
import { Order } from '../models/order.model.js';
import { Payment } from '../models/payment.model.js';
import { WebsiteSettings } from '../models/misc.model.js';
import { availableMethods } from './payments.controller.js';
import { presentOrderPublic, returnWindowDays } from '../services/order.service.js';
import { placeOrder } from '../services/checkout.service.js';
import { buildQuote, publicQuote } from '../services/quote.service.js';
import { verifyOrderToken } from '../utils/tokens.js';

export async function quote(req: Request, res: Response) {
  const q = await buildQuote(req.body);
  res.json({ success: true, data: publicQuote(q) });
}

export async function validateCoupon(req: Request, res: Response) {
  const { code, items, district, phone } = req.body;
  const q = await buildQuote({ items, district, phone, couponCode: code });
  if (q.coupon) res.json({ success: true, data: { valid: true, code: q.coupon.code, type: q.coupon.type, discount: q.coupon.discount, freeDelivery: q.coupon.freeDelivery, total: q.total } });
  else res.json({ success: true, data: { valid: false, reason: q.couponError?.reason ?? 'NOT_APPLICABLE', message: q.couponError?.message ?? 'This coupon cannot be used.' } });
}

export async function deliveryZones(_req: Request, res: Response) {
  const s = await WebsiteSettings.findOne({ key: 'main' }).lean();
  const zones = (s?.delivery?.zones ?? []).filter((z) => z.active).map((z) => ({ key: z.key, name: z.name, fee: z.fee, etaDays: z.etaDays ?? null }));
  res.json({ success: true, data: { zones, districts: DISTRICTS, codEnabled: s?.payments?.codEnabled ?? true, methods: await availableMethods() } });
}

export async function checkout(req: Request, res: Response) {
  const r = await placeOrder(req.body, {
    userId: req.principal?.kind === 'user' ? req.principal.id : undefined,
    ip: req.ip, userAgent: req.get('user-agent') ?? undefined,
  });
  res.status(r.replay ? 200 : 201).json({ success: true, data: r });
}

/** Confirmation-page data. Requires the signed token issued at checkout; exposes no address or full phone. */
export async function orderStatus(req: Request, res: Response) {
  const orderNo = req.params['orderNo']!;
  const token = (req.query as { token: string }).token;
  if (verifyOrderToken(token) !== orderNo) throw Errors.unauthenticated('This confirmation link is invalid or has expired.');
  const o = await Order.findOne({ orderNo }).lean();
  if (!o || !o.customer) throw Errors.notFound('Order not found');
  const pay = await Payment.findById(o.payment, { status: 1, method: 1, provider: 1, 'manual.submittedAt': 1 }).lean();
  const stg = o.paymentMethod.startsWith('manual_') ? await WebsiteSettings.findOne({ key: 'main' }, { payments: 1 }).lean() : null;
  const mKey = o.paymentMethod.replace('manual_', '') as 'bkash' | 'nagad' | 'rocket' | 'bank';
  const bank = stg?.payments?.bank;
  const manualInfo = (canSubmit: boolean) => {
    const base = { channel: mKey, canSubmit, submitted: Boolean(pay?.manual?.submittedAt) && o.paymentStatus === 'pending' };
    if (mKey === 'bank') return { ...base, number: null, instructions: bank?.instructions ?? null, bank: { bankName: bank?.bankName ?? null, accountName: bank?.accountName ?? null, accountNumber: bank?.accountNumber ?? null, branch: bank?.branch ?? null } };
    return { ...base, number: stg?.payments?.manual?.[mKey] ?? null, instructions: stg?.payments?.manual?.instructions?.[mKey] ?? null, bank: null };
  };
  const payable = o.status === 'pending' && (['initiated', 'failed', 'cancelled'] as string[]).includes(o.paymentStatus) && (!o.reservationExpiresAt || o.reservationExpiresAt.getTime() > Date.now());
  res.json({
    success: true,
    data: {
      payment: {
        method: o.paymentMethod, status: o.paymentStatus,
        expiresAt: o.paymentMethod !== 'cod' && payable ? o.reservationExpiresAt ?? null : null,
        manual: o.paymentMethod.startsWith('manual_') ? manualInfo(payable || o.paymentStatus === 'pending') : null,
      },
      ...presentOrderPublic(o, await returnWindowDays()),
      orderNo: o.orderNo, status: o.status, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod, createdAt: o.createdAt,
      items: o.items.map((i) => ({ name: i.name, image: i.image ?? null, unitPrice: i.unitPrice, quantity: i.quantity, lineTotal: i.lineTotal })),
      subtotal: o.subtotal, productDiscount: o.productDiscount, couponDiscount: o.couponDiscount, deliveryFee: o.deliveryFee, total: o.total,
      deliveryZone: o.deliveryZone?.name ?? null,
      customer: { firstName: o.customer.name.split(' ')[0], phoneMasked: `${o.customer.phone.slice(0, 3)}*****${o.customer.phone.slice(-3)}`, district: o.customer.district },
    },
  });
}
