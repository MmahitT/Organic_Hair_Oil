import type { Request, Response } from 'express';
import { Errors } from '../middleware/errorHandler.js';
import { Coupon, CouponRedemption } from '../models/coupon.model.js';
import { Order } from '../models/order.model.js';
import { audit } from '../services/audit.service.js';
import { escapeRegex } from '../utils/slug.js';
import { normalizeBdPhone } from '../utils/phone.js';
import mongoose from 'mongoose';
import { Admin } from '../models/admin.model.js';
import { Payment } from '../models/payment.model.js';
import { WebsiteSettings } from '../models/misc.model.js';
import { cancelOrder, changeStatus, processReturn, resolveRequest, CANCELLABLE } from '../services/order.service.js';
import { dhakaDayStart } from '../services/dashboard.service.js';
import { renderInvoice } from '../utils/invoice.js';

type Q = { page: number; limit: number; q?: string; status?: string; paymentStatus?: string; payType?: 'cod' | 'prepaid'; method?: string; district?: string; from?: string; to?: string; sort: 'newest' | 'oldest' | 'total_desc' | 'total_asc' };


export async function listOrders(req: Request, res: Response) {
  const { page, limit, q, status, paymentStatus, payType, method, district, from, to, sort } = req.query as unknown as Q;
  const filter: Record<string, unknown> = {};
  if (status) filter['status'] = status;
  if (paymentStatus) filter['paymentStatus'] = paymentStatus;
  if (payType === 'cod') filter['paymentMethod'] = 'cod'; // cash-on-delivery orders are kept apart from prepaid ones
  if (payType === 'prepaid') filter['paymentMethod'] = mongoose.trusted({ $ne: 'cod' });
  if (method) filter['paymentMethod'] = method;
  if (district) filter['customer.district'] = district;
  if (from || to) filter['createdAt'] = mongoose.trusted({ ...(from && { $gte: dhakaDayStart(from) }), ...(to && { $lt: new Date(dhakaDayStart(to).getTime() + 86_400_000) }) });
  if (q) {
    const phone = normalizeBdPhone(q);
    const rx = mongoose.trusted({ $regex: escapeRegex(q), $options: 'i' });
    filter['$or'] = [{ orderNo: q.toUpperCase() }, ...(phone ? [{ 'customer.phone': phone }] : []), { 'customer.name': rx }, { 'customer.phone': rx }];
  }
  const [items, total] = await Promise.all([
    Order.find(filter).sort({ newest: { createdAt: -1 }, oldest: { createdAt: 1 }, total_desc: { total: -1, createdAt: -1 }, total_asc: { total: 1, createdAt: -1 } }[sort] as Record<string, 1 | -1>).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  res.json({ success: true, data: { items }, meta: { page, limit, total } });
}

export async function getOrder(req: Request, res: Response) {
  const o = await Order.findById(req.params['id']).lean();
  if (!o) throw Errors.notFound('Order not found');
  res.json({ success: true, data: { order: o } });
}

/* ---------- coupons ---------- */
export async function listCoupons(_req: Request, res: Response) {
  res.json({ success: true, data: { items: await Coupon.find().sort({ createdAt: -1 }).lean() } });
}
export async function createCoupon(req: Request, res: Response) {
  const doc = await Coupon.create(req.body);
  await audit({ action: 'coupon.created', req, entityType: 'Coupon', entityId: String(doc._id), after: { code: doc.code, type: doc.type, value: doc.value } });
  res.status(201).json({ success: true, data: { coupon: doc } });
}
export async function updateCoupon(req: Request, res: Response) {
  const doc = await Coupon.findById(req.params['id']);
  if (!doc) throw Errors.notFound('Coupon not found');
  const before = { isActive: doc.isActive, value: doc.value, usageLimit: doc.usageLimit, expiresAt: doc.expiresAt };
  doc.set(req.body);
  await doc.save();
  await audit({ action: 'coupon.updated', req, entityType: 'Coupon', entityId: String(doc._id), before, after: req.body });
  res.json({ success: true, data: { coupon: doc } });
}
export async function deactivateCoupon(req: Request, res: Response) {
  const doc = await Coupon.findById(req.params['id']);
  if (!doc) throw Errors.notFound('Coupon not found');
  doc.isActive = false;
  await doc.save();
  await audit({ action: 'coupon.deactivated', req, entityType: 'Coupon', entityId: String(doc._id) });
  res.status(204).end();
}
export async function couponUsage(req: Request, res: Response) {
  const items = await CouponRedemption.find({ coupon: req.params['id'] }).sort({ createdAt: -1 }).limit(200).lean();
  res.json({ success: true, data: { items } });
}

/* ---------- Phase 7: workflow ---------- */
async function actorOf(req: Request) {
  const id = req.principal!.id;
  const a = await Admin.findById(id, { name: 1 }).lean();
  return { id, label: `${a?.name ?? 'admin'} (${req.principal!.role})` };
}
const oid = (req: Request) => req.params['id']!;

export async function setStatus(req: Request, res: Response) {
  const { status, note } = req.body as { status: string; note?: string };
  const before = await Order.findById(oid(req), { status: 1 }).lean();
  const r = await changeStatus(oid(req), status, note, await actorOf(req));
  await audit({ req, action: 'order.status', entityType: 'Order', entityId: oid(req), before: { status: before?.status }, after: { status: r.status, note } });
  res.json({ success: true, data: r });
}

export async function cancel(req: Request, res: Response) {
  const r = await cancelOrder(oid(req), (req.body as { reason: string }).reason, await actorOf(req));
  await audit({ req, action: 'order.cancel', entityType: 'Order', entityId: oid(req), after: { reason: (req.body as { reason: string }).reason, refundNeeded: r.refundNeeded } });
  res.json({ success: true, data: r });
}

export async function returnOrder(req: Request, res: Response) {
  const { restock, note } = req.body as { restock: boolean; note: string };
  const r = await processReturn(oid(req), restock, note, await actorOf(req));
  await audit({ req, action: 'order.return', entityType: 'Order', entityId: oid(req), after: { restock, note, refundNeeded: r.refundNeeded } });
  res.json({ success: true, data: r });
}

export async function decideRequest(req: Request, res: Response) {
  const { approve, note } = req.body as { approve: boolean; note: string };
  const kind = req.params['kind'] as 'cancellation' | 'return';
  const r = await resolveRequest(oid(req), kind, approve, note, await actorOf(req));
  await audit({ req, action: `order.${kind}_request.${approve ? 'approve' : 'decline'}`, entityType: 'Order', entityId: oid(req), after: { note } });
  res.json({ success: true, data: r });
}

export async function patchOrder(req: Request, res: Response) {
  const b = req.body as { notes?: string; courier?: Record<string, string | undefined>; customer?: Record<string, string> };
  const o = await Order.findById(oid(req), { status: 1, notes: 1, courier: 1, customer: 1 }).lean();
  if (!o) throw Errors.notFound('Order not found');
  if (b.customer && !CANCELLABLE.includes(o.status)) throw Errors.businessRule('The delivery address can only be changed before the order ships');
  const set: Record<string, unknown> = {};
  if (b.notes !== undefined) set['notes'] = b.notes;
  for (const [k, v] of Object.entries(b.courier ?? {})) set[`courier.${k}`] = v ?? null;
  for (const [k, v] of Object.entries(b.customer ?? {})) set[`customer.${k}`] = v;
  const after = await Order.findByIdAndUpdate(oid(req), { $set: set }, { new: true, runValidators: true }).lean();
  await audit({ req, action: 'order.update', entityType: 'Order', entityId: oid(req), before: { notes: o.notes, courier: o.courier, address: o.customer?.address }, after: { notes: after?.notes, courier: after?.courier, address: after?.customer?.address } });
  res.json({ success: true, data: { order: after } });
}

export async function adminInvoice(req: Request, res: Response) {
  const o = await Order.findById(oid(req)).lean();
  if (!o?.customer) throw Errors.notFound('Order not found');
  const s = await WebsiteSettings.findOne({ key: 'main' }, { business: 1 }).lean();
  res.set('Cache-Control', 'no-store').type('html').send(renderInvoice({ ...o, customer: o.customer }, s?.business ?? {}));
}

/** What needs the owner's attention right now (drives the badge in the admin menu). */
export async function summary(_req: Request, res: Response) {
  const [newOrders, cancelRequests, returnRequests, manualPayments, pendingReviews, newMessages] = await Promise.all([
    Order.countDocuments({ status: 'pending', paymentStatus: mongoose.trusted({ $in: ['cod_pending', 'paid'] }) }),
    Order.countDocuments({ 'cancellation.status': 'requested' }),
    Order.countDocuments({ 'returnInfo.status': 'requested' }),
    Payment.countDocuments({ provider: 'manual', status: 'pending' }),
    (await import('../models/review.model.js')).Review.countDocuments({ status: 'pending' }),
    (await import('../models/misc.model.js')).ContactMessage.countDocuments({ status: 'new' }),
  ]);
  res.json({ success: true, data: { newOrders, cancelRequests, returnRequests, manualPayments, pendingReviews, newMessages } });
}

const csvCell = (v: unknown) => {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; // spreadsheet formula injection guard
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
export async function exportOrders(req: Request, res: Response) {
  const { status, from, to } = req.query as unknown as { status?: string; from?: Date; to?: Date };
  const filter: Record<string, unknown> = {};
  if (status) filter['status'] = status;
  if (from || to) filter['createdAt'] = mongoose.trusted({ ...(from && { $gte: from }), ...(to && { $lte: to }) });
  const rows = await Order.find(filter).sort({ createdAt: -1 }).limit(5000).lean();
  const head = ['Order', 'Date', 'Status', 'Payment method', 'Payment status', 'Total', 'Name', 'Phone', 'District', 'City', 'Address', 'Items'];
  const lines = rows.map((o) => [o.orderNo, o.createdAt.toISOString(), o.status, o.paymentMethod, o.paymentStatus, o.total, o.customer?.name, o.customer?.phone, o.customer?.district, o.customer?.city, o.customer?.address, o.items.map((i) => `${i.name} x${i.quantity}`).join('; ')].map(csvCell).join(','));
  await audit({ req, action: 'order.export', entityType: 'Order', after: { count: rows.length, status } });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="orders.csv"', 'Cache-Control': 'no-store' }).send(`\uFEFF${[head.join(','), ...lines].join('\r\n')}`);
}

export async function updateOrderSettings(req: Request, res: Response) {
  const b = req.body as { autoConfirm?: boolean; returnWindowDays?: number | null };
  const set: Record<string, unknown> = {};
  if (b.autoConfirm !== undefined) set['orderSettings.autoConfirm'] = b.autoConfirm;
  if (b.returnWindowDays !== undefined) set['orderSettings.returnWindowDays'] = b.returnWindowDays;
  const before = await WebsiteSettings.findOne({ key: 'main' }, { orderSettings: 1 }).lean();
  if (!before) throw Errors.notFound('Settings not configured');
  const after = await WebsiteSettings.findOneAndUpdate({ key: 'main' }, { $set: set }, { new: true, projection: { orderSettings: 1 } }).lean();
  await audit({ req, action: 'settings.orders.update', entityType: 'WebsiteSettings', entityId: 'main', before: before.orderSettings, after: after?.orderSettings });
  res.json({ success: true, data: { autoConfirm: after?.orderSettings?.autoConfirm ?? false, returnWindowDays: after?.orderSettings?.returnWindowDays ?? null } });
}
export async function getOrderSettings(_req: Request, res: Response) {
  const s = await WebsiteSettings.findOne({ key: 'main' }, { orderSettings: 1 }).lean();
  res.json({ success: true, data: { autoConfirm: s?.orderSettings?.autoConfirm ?? false, returnWindowDays: s?.orderSettings?.returnWindowDays ?? null } });
}
