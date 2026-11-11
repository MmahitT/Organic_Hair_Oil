import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Errors } from '../middleware/errorHandler.js';
import { Payment } from '../models/payment.model.js';
import { WebsiteSettings } from '../models/misc.model.js';
import { Order } from '../models/order.model.js';
import { audit } from '../services/audit.service.js';
import { Admin } from '../models/admin.model.js';
import { refundPayment, resolvePayment, submitManualPayment } from '../services/payment.service.js';
import { dhakaDayStart } from '../services/dashboard.service.js';
import { csv } from '../services/customers.service.js';
import { escapeRegex } from '../utils/slug.js';
import { verifyOrderToken } from '../utils/tokens.js';

export async function manualSubmit(req: Request, res: Response) {
  const { orderNo, token, ...rest } = req.body as { orderNo: string; token: string; trxId: string; senderNumber?: string; senderName?: string; reference?: string };
  if (verifyOrderToken(token) !== orderNo) throw Errors.unauthenticated('This link is invalid or has expired.');
  await submitManualPayment(orderNo, rest);
  res.json({ success: true, data: { submitted: true } });
}

const MFS = ['bkash', 'nagad', 'rocket'] as const;
/**
 * What the storefront may offer at checkout, including the owner's payment instructions and account details (customers
 * need them to pay). They come from the database, edited in Admin → Payments — never from code or the repository.
 */
export async function availableMethods() {
  const s = await WebsiteSettings.findOne({ key: 'main' }, { payments: 1 }).lean();
  const m = s?.payments?.manual;
  const b = s?.payments?.bank;
  return {
    cod: s?.payments?.codEnabled ?? true,
    manual: m?.enabled ? MFS.filter((k) => m[k]).map((k) => ({ channel: k, number: m[k] as string, instructions: m.instructions?.[k] ?? null })) : [],
    bank: b?.enabled && b.accountNumber ? { bankName: b.bankName ?? null, accountName: b.accountName ?? null, accountNumber: b.accountNumber, branch: b.branch ?? null, instructions: b.instructions ?? null } : null,
  };
}

/* ---------- admin ---------- */
export async function listPayments(req: Request, res: Response) {
  const { page, limit, status, provider, q, from, to } = req.query as unknown as { page: number; limit: number; status?: string; provider?: string; q?: string; from?: string; to?: string };
  const filter: Record<string, unknown> = {};
  if (from || to) filter['createdAt'] = mongoose.trusted({ ...(from && { $gte: dhakaDayStart(from) }), ...(to && { $lt: new Date(dhakaDayStart(to).getTime() + 86_400_000) }) });
  if (status) filter['status'] = status;
  if (provider) filter['provider'] = provider;
  if (q) {
    const orders = await Order.find({ orderNo: q.toUpperCase() }, { _id: 1 }).lean();
    filter['$or'] = [{ tranId: mongoose.trusted({ $regex: escapeRegex(q), $options: 'i' }) }, { 'manual.trxId': q.toUpperCase() }, { order: mongoose.trusted({ $in: orders.map((o) => o._id) }) }];
  }
  const [items, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('order', 'orderNo total customer.name customer.phone status').lean(),
    Payment.countDocuments(filter),
  ]);
  res.json({ success: true, data: { items }, meta: { page, limit, total } });
}

export async function getPayment(req: Request, res: Response) {
  const p = await Payment.findById(req.params['id']).select('+gatewayResponse').populate('order', 'orderNo total customer.name customer.phone status paymentStatus').lean();
  if (!p) throw Errors.notFound('Payment not found');
  res.json({ success: true, data: { payment: p } });
}

export async function resolve(req: Request, res: Response) {
  const { approve, note } = req.body as { approve: boolean; note: string };
  const id = req.params['id']!;
  const a = await Admin.findById(req.principal!.id, { name: 1 }).lean();
  const r = await resolvePayment(id, approve, note, req.principal!.id, `${a?.name ?? 'admin'} (${req.principal!.role})`);
  await audit({ req, action: approve ? 'payment.approve' : 'payment.reject', entityType: 'Payment', entityId: id, after: { status: r.status, note } });
  res.json({ success: true, data: r });
}

export async function refund(req: Request, res: Response) {
  const { amount, reason } = req.body as { amount?: number; reason: string };
  const id = req.params['id']!;
  const a = await Admin.findById(req.principal!.id, { name: 1 }).lean();
  const r = await refundPayment(id, amount, reason, req.principal!.id, `${a?.name ?? 'admin'} (${req.principal!.role})`);
  await audit({ req, action: 'payment.refund', entityType: 'Payment', entityId: id, after: { amount, reason, ...r } });
  res.json({ success: true, data: r });
}

export async function getPaymentSettings(_req: Request, res: Response) {
  const s = await WebsiteSettings.findOne({ key: 'main' }, { payments: 1 }).lean();
  const p = s?.payments;
  res.json({
    success: true,
    data: {
      codEnabled: p?.codEnabled ?? true,
      manual: { enabled: p?.manual?.enabled ?? false, bkash: p?.manual?.bkash ?? '', nagad: p?.manual?.nagad ?? '', rocket: p?.manual?.rocket ?? '', instructions: { bkash: p?.manual?.instructions?.bkash ?? '', nagad: p?.manual?.instructions?.nagad ?? '', rocket: p?.manual?.instructions?.rocket ?? '' } },
      bank: { enabled: p?.bank?.enabled ?? false, bankName: p?.bank?.bankName ?? '', accountName: p?.bank?.accountName ?? '', accountNumber: p?.bank?.accountNumber ?? '', branch: p?.bank?.branch ?? '', instructions: p?.bank?.instructions ?? '' },
    },
  });
}

type Flat = Record<string, unknown>;
const flatten = (prefix: string, obj: Flat | undefined, out: Flat) => {
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(`${prefix}.${k}`, v as Flat, out);
    else out[`${prefix}.${k}`] = v === '' ? null : v;
  }
};

export async function updatePaymentSettings(req: Request, res: Response) {
  const b = req.body as { codEnabled?: boolean; manual?: Flat; bank?: Flat };
  const set: Flat = {};
  if (b.codEnabled !== undefined) set['payments.codEnabled'] = b.codEnabled;
  flatten('payments.manual', b.manual, set);
  flatten('payments.bank', b.bank, set);
  const before = await WebsiteSettings.findOne({ key: 'main' }, { payments: 1 }).lean();
  if (!before) throw Errors.notFound('Settings not configured');
  const after = await WebsiteSettings.findOneAndUpdate({ key: 'main' }, { $set: set }, { new: true, projection: { payments: 1 } }).lean();
  // A method must never be switched on without the details customers need to pay — roll the switch back and say why.
  const m = after?.payments?.manual; const bk = after?.payments?.bank;
  if (m?.enabled && !MFS.some((k) => m[k])) {
    await WebsiteSettings.updateOne({ key: 'main' }, { $set: { 'payments.manual.enabled': false } });
    throw Errors.businessRule('Add at least one bKash / Nagad / Rocket number before turning manual payment on');
  }
  if (bk?.enabled && !(bk.bankName && bk.accountName && bk.accountNumber)) {
    await WebsiteSettings.updateOne({ key: 'main' }, { $set: { 'payments.bank.enabled': false } });
    throw Errors.businessRule('Add the bank name, account name and account number before turning bank transfer on');
  }
  await audit({ req, action: 'settings.payments.update', entityType: 'WebsiteSettings', entityId: 'main', before: before.payments, after: after?.payments });
  return getPaymentSettings(req, res);
}

/** Payments CSV for bookkeeping. No customer phone numbers: just order, method, amounts, status and the TrxID. */
export async function exportPayments(req: Request, res: Response) {
  const { from, to } = req.query as { from?: string; to?: string };
  const filter: Record<string, unknown> = {};
  if (from || to) filter['createdAt'] = mongoose.trusted({ ...(from && { $gte: dhakaDayStart(from) }), ...(to && { $lt: new Date(dhakaDayStart(to).getTime() + 86_400_000) }) });
  const rows = await Payment.find(filter).sort({ createdAt: -1 }).limit(5000).populate('order', 'orderNo').lean();
  const body = csv(['Date', 'Order', 'Type', 'Method', 'Amount (BDT)', 'Refunded (BDT)', 'Status', 'Transaction ID', 'Reference'], rows.map((p) => [p.createdAt.toISOString(), (p.order as unknown as { orderNo?: string } | null)?.orderNo ?? '', p.provider, p.method ?? '', p.amount, p.refundedTotal ?? 0, p.status, p.manual?.trxId ?? '', p.manual?.reference ?? '']));
  await audit({ req, action: 'payment.export', entityType: 'Payment', after: { rows: rows.length } });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="payments.csv"', 'Cache-Control': 'no-store' }).send(body);
}
