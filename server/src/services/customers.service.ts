import mongoose from 'mongoose';
import { Customer } from '../models/misc.model.js';
import { Order } from '../models/order.model.js';
import { User } from '../models/user.model.js';
import { escapeRegex } from '../utils/slug.js';
import { normalizeBdPhone } from '../utils/phone.js';
import { REVENUE_STATUSES } from './dashboard.service.js';

const trusted = <T>(v: T) => mongoose.trusted(v as object) as unknown as T;

interface Row { _id: string; name: string; district: string; orders: number; spent: number; first: Date; last: Date }

/** Phones the owner blocked (guest-checkout customers) plus customers with a blocked account. */
export async function blockedPhones(): Promise<string[]> {
  const [a, b] = await Promise.all([Customer.find({ isBlocked: true }, { phone: 1 }).lean(), User.find({ isBlocked: true }, { phone: 1 }).lean()]);
  return [...new Set([...a, ...b].map((x) => x.phone))];
}
export async function isBlocked(phone: string): Promise<boolean> {
  return Boolean(await Customer.exists({ phone, isBlocked: true })) || Boolean(await User.exists({ phone, isBlocked: true }));
}

const stats = [
  { $sort: { createdAt: 1 as const } },
  {
    $group: {
      _id: '$customer.phone', name: { $last: '$customer.name' }, district: { $last: '$customer.district' }, orders: { $sum: 1 },
      spent: { $sum: { $cond: [{ $in: ['$status', REVENUE_STATUSES] }, '$total', 0] } }, first: { $min: '$createdAt' }, last: { $max: '$createdAt' },
    },
  },
];

export async function listCustomers(o: { page: number; limit: number; q?: string; sort: 'recent' | 'spent' | 'orders'; blocked?: 'true' | 'false' }) {
  const match: Record<string, unknown> = {};
  if (o.q) {
    const phone = normalizeBdPhone(o.q);
    match['$or'] = [...(phone ? [{ 'customer.phone': phone }] : []), { 'customer.name': trusted({ $regex: escapeRegex(o.q), $options: 'i' }) }, { 'customer.phone': trusted({ $regex: escapeRegex(o.q) }) }];
  }
  if (o.blocked) {
    const phones = await blockedPhones();
    match['customer.phone'] = o.blocked === 'true' ? trusted({ $in: phones }) : trusted({ $nin: phones });
    if (match['$or']) { match['$and'] = [{ $or: match['$or'] }, { 'customer.phone': match['customer.phone'] }]; delete match['$or']; delete match['customer.phone']; }
  }
  const sortKey: Record<string, 1 | -1> = o.sort === 'spent' ? { spent: -1 } : o.sort === 'orders' ? { orders: -1 } : { last: -1 };
  const [res] = await Order.aggregate<{ rows: Row[]; total: { n: number }[] }>([
    { $match: match }, ...stats,
    { $facet: { rows: [{ $sort: sortKey }, { $skip: (o.page - 1) * o.limit }, { $limit: o.limit }], total: [{ $count: 'n' }] } },
  ]);
  const rows = res?.rows ?? [];
  const phones = rows.map((r) => r._id);
  const [profiles, users] = await Promise.all([Customer.find({ phone: trusted({ $in: phones }) }).lean(), User.find({ phone: trusted({ $in: phones }) }, { phone: 1, isBlocked: 1 }).lean()]);
  const items = rows.map((r) => ({
    phone: r._id, name: r.name, district: r.district, orders: r.orders, spent: r.spent, firstOrderAt: r.first, lastOrderAt: r.last,
    isBlocked: Boolean(profiles.find((p) => p.phone === r._id)?.isBlocked || users.find((u) => u.phone === r._id)?.isBlocked),
    hasNotes: Boolean(profiles.find((p) => p.phone === r._id)?.notes),
    returning: r.orders > 1,
  }));
  return { items, total: res?.total[0]?.n ?? 0 };
}

export async function customerDetail(phone: string) {
  const [s] = await Order.aggregate<Row>([{ $match: { 'customer.phone': phone } }, ...stats]);
  if (!s) return null;
  const [orders, profile, user] = await Promise.all([
    Order.find({ 'customer.phone': phone }, { orderNo: 1, status: 1, paymentStatus: 1, paymentMethod: 1, total: 1, createdAt: 1, 'items.name': 1, 'items.quantity': 1 }).sort({ createdAt: -1 }).limit(50).lean(),
    Customer.findOne({ phone }).lean(), User.findOne({ phone }, { email: 1, isBlocked: 1, createdAt: 1 }).lean(),
  ]);
  const addresses = await Order.aggregate<{ _id: string; address: string; city: string; district: string; last: Date }>([
    { $match: { 'customer.phone': phone } }, { $sort: { createdAt: -1 } },
    { $group: { _id: { $concat: ['$customer.address', '|', '$customer.city'] }, address: { $first: '$customer.address' }, city: { $first: '$customer.city' }, district: { $first: '$customer.district' }, last: { $first: '$createdAt' } } },
    { $sort: { last: -1 } }, { $limit: 5 },
  ]);
  return {
    phone, name: s.name, orders: s.orders, spent: s.spent, firstOrderAt: s.first, lastOrderAt: s.last, returning: s.orders > 1,
    email: user?.email ?? (await Order.findOne({ 'customer.phone': phone, 'customer.email': trusted({ $exists: true, $ne: null }) }, { 'customer.email': 1 }).sort({ createdAt: -1 }).lean())?.customer?.email ?? null,
    hasAccount: Boolean(user), isBlocked: Boolean(profile?.isBlocked || user?.isBlocked), notes: profile?.notes ?? '',
    addresses: addresses.map((a) => ({ address: a.address, city: a.city, district: a.district })),
    recentOrders: orders.map((o) => ({ id: String(o._id), orderNo: o.orderNo, status: o.status, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod, total: o.total, createdAt: o.createdAt, items: o.items.map((i) => `${i.name} ×${i.quantity}`).join(', ') })),
  };
}

export async function updateCustomer(phone: string, patch: { notes?: string; isBlocked?: boolean }, by: string) {
  const set: Record<string, unknown> = {};
  if (patch.notes !== undefined) set['notes'] = patch.notes;
  if (patch.isBlocked !== undefined) Object.assign(set, patch.isBlocked ? { isBlocked: true, blockedAt: new Date(), blockedBy: by } : { isBlocked: false, blockedAt: null, blockedBy: null });
  const before = await Customer.findOne({ phone }).lean();
  await Customer.updateOne({ phone }, { $set: set, $setOnInsert: { phone } }, { upsert: true });
  // keep a registered account's own block flag in step so a blocked customer cannot sign in either
  if (patch.isBlocked !== undefined) await User.updateOne({ phone }, { $set: { isBlocked: patch.isBlocked } });
  return { before: { notes: before?.notes ?? '', isBlocked: before?.isBlocked ?? false }, after: patch };
}

const cell = (v: unknown) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export const csv = (head: string[], rows: unknown[][]) => `\uFEFF${[head.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n')}`;

export async function exportCustomers() {
  const rows = await Order.aggregate<Row>([...stats, { $sort: { last: -1 } }, { $limit: 5000 }]);
  const blocked = new Set(await blockedPhones());
  return csv(['Phone', 'Name', 'District', 'Orders', 'Spent (BDT)', 'First order', 'Last order', 'Blocked'], rows.map((r) => [r._id, r.name, r.district, r.orders, r.spent, r.first.toISOString(), r.last.toISOString(), blocked.has(r._id) ? 'yes' : 'no']));
}
