import mongoose from 'mongoose';
import { Order } from '../models/order.model.js';
import { Product } from '../models/catalog.model.js';

/**
 * Dashboard numbers. Definitions (shown to the owner in the admin):
 *  - "Revenue" = value of orders that are confirmed or further along (confirmed, processing, shipped, out for delivery,
 *    delivered). Pending, cancelled and returned orders never count.
 *  - Days are Bangladesh days (UTC+6), by the time the order was placed.
 */
export const REVENUE_STATUSES = ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'];
const DAY = 86_400_000;
const TZ = 'Asia/Dhaka';

/** "YYYY-MM-DD" in Bangladesh time → the instant that day starts. */
export const dhakaDayStart = (d: string) => new Date(`${d}T00:00:00+06:00`);
export const dhakaToday = (now = new Date()) => new Date(now.getTime() + 6 * 3600_000).toISOString().slice(0, 10);

export interface Range { from: Date; to: Date; days: string[] } // [from, to) in instants; `days` = every Dhaka day in range
export function resolveRange(fromStr?: string, toStr?: string, now = new Date()): Range {
  const today = dhakaToday(now);
  const last = toStr ?? today;
  const first = fromStr ?? new Date(dhakaDayStart(last).getTime() - 29 * DAY).toISOString().slice(0, 10);
  const from = dhakaDayStart(first);
  const to = new Date(dhakaDayStart(last).getTime() + DAY);
  const days: string[] = [];
  for (let t = from.getTime(); t < to.getTime(); t += DAY) days.push(new Date(t + 6 * 3600_000).toISOString().slice(0, 10));
  return { from, to, days };
}

const inRange = (r: Range) => ({ createdAt: { $gte: r.from, $lt: r.to } });
const revenueMatch = (r: Range) => ({ ...inRange(r), status: { $in: REVENUE_STATUSES } });

export async function summary(r: Range) {
  const [rev, byStatus, split, pendingNow, firsts] = await Promise.all([
    Order.aggregate<{ revenue: number; orders: number }>([{ $match: revenueMatch(r) }, { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } }]),
    Order.aggregate<{ _id: string; n: number }>([{ $match: inRange(r) }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Order.aggregate<{ _id: string; revenue: number; orders: number }>([{ $match: revenueMatch(r) }, { $group: { _id: { $cond: [{ $eq: ['$paymentMethod', 'cod'] }, 'cod', 'prepaid'] }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } }]),
    Order.countDocuments({ status: 'pending' }),
    // each customer (by phone) with the first time they ever ordered, to tell new from returning
    Order.aggregate<{ _id: string; first: Date; inRange: boolean }>([
      { $group: { _id: '$customer.phone', first: { $min: '$createdAt' }, last: { $max: '$createdAt' }, inRange: { $max: { $and: [{ $gte: ['$createdAt', r.from] }, { $lt: ['$createdAt', r.to] }] } } } },
      { $match: { inRange: true } },
    ]),
  ]);
  const statuses = Object.fromEntries(['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'].map((s) => [s, byStatus.find((x) => x._id === s)?.n ?? 0]));
  const revenue = rev[0]?.revenue ?? 0;
  const orders = rev[0]?.orders ?? 0;
  const newCustomers = firsts.filter((c) => c.first >= r.from && c.first < r.to).length;
  const part = (k: string) => ({ revenue: split.find((x) => x._id === k)?.revenue ?? 0, orders: split.find((x) => x._id === k)?.orders ?? 0 });
  return {
    range: { from: r.days[0], to: r.days.at(-1), days: r.days.length },
    revenue, revenueOrders: orders, averageOrderValue: orders ? Math.round(revenue / orders) : 0,
    ordersByStatus: statuses, ordersPlaced: Object.values(statuses).reduce((a, b) => a + b, 0),
    pendingOrders: pendingNow, completedOrders: statuses['delivered'] ?? 0,
    customers: { newCustomers, returningCustomers: firsts.length - newCustomers },
    paymentSplit: { cod: part('cod'), prepaid: part('prepaid') },
    definition: 'Revenue counts orders that are confirmed or further along. Pending, cancelled and returned orders are not counted.',
  };
}

export async function salesChart(r: Range) {
  const rows = await Order.aggregate<{ _id: string; revenue: number; orders: number }>([
    { $match: revenueMatch(r) },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
  ]);
  const by = new Map(rows.map((x) => [x._id, x]));
  return r.days.map((d) => ({ date: d, revenue: by.get(d)?.revenue ?? 0, orders: by.get(d)?.orders ?? 0 }));
}

export async function bestSellers(r: Range, limit = 5) {
  return Order.aggregate<{ product: string; name: string; quantity: number; revenue: number }>([
    { $match: revenueMatch(r) },
    { $unwind: '$items' },
    { $group: { _id: '$items.product', name: { $first: '$items.name' }, quantity: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineTotal' } } },
    { $sort: { quantity: -1, revenue: -1 } },
    { $limit: limit },
    { $project: { _id: 0, product: { $toString: '$_id' }, name: 1, quantity: 1, revenue: 1 } },
  ]);
}

export async function recentOrders(limit = 10) {
  const rows = await Order.find({}, { orderNo: 1, total: 1, status: 1, paymentStatus: 1, paymentMethod: 1, createdAt: 1, 'customer.name': 1 }).sort({ createdAt: -1 }).limit(limit).lean();
  return rows.map((o) => ({ id: String(o._id), orderNo: o.orderNo, name: o.customer?.name ?? '', total: o.total, status: o.status, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod, createdAt: o.createdAt }));
}

/** Variants at or under their alert level (own stock only; a combo's availability follows its parts). */
export async function lowStock() {
  const products = await Product.find({ deletedAt: null, type: mongoose.trusted({ $ne: 'bundle' }) }, { name: 1, slug: 1, visibility: 1, variants: 1 }).lean();
  return products
    .flatMap((p) => p.variants.filter((v) => v.isActive !== false).map((v) => ({ productId: String(p._id), name: p.name, label: v.label, sku: v.sku, stock: v.stock, threshold: v.lowStockThreshold ?? 5, published: p.visibility === 'published' })))
    .filter((v) => v.stock <= v.threshold)
    .sort((a, b) => a.stock - b.stock);
}
