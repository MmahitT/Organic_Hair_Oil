import mongoose, { type ClientSession } from 'mongoose';
import type { ProductObj } from '../models/catalog.model.js';
import { Product } from '../models/catalog.model.js';
import { WebsiteSettings } from '../models/misc.model.js';
import { AppError } from '../middleware/errorHandler.js';
import { MAX_QTY_PER_LINE, bundleAvailable, effectivePrice, variantAvailable } from './catalog.service.js';
import { evaluateCoupon, type CouponResult } from './coupon.service.js';

const trusted = mongoose.trusted;

export interface QuoteInput {
  items: { productId: string; sku: string; qty: number }[];
  couponCode?: string;
  district?: string;
  zoneKey?: string;
  phone?: string;
}

export type LineIssue = 'ITEM_UNAVAILABLE' | 'STOCK_REDUCED';

export interface QuoteLine {
  productId: string;
  sku: string;
  name: string;
  nameBn: string | null;
  image: string | null;
  isBundle: boolean;
  requestedQty: number;
  qty: number; // quantity actually priced (after stock/max-per-order limits)
  maxQty: number;
  unitPrice: number;
  regularPrice: number;
  lineTotal: number; // unitPrice * qty
  freeDelivery: boolean;
  unavailable: boolean;
  issue: LineIssue | null;
}

export interface StockPlanEntry { productId: string; sku: string; qty: number }

export interface Quote {
  lines: QuoteLine[];
  subtotal: number; // at regular prices
  productDiscount: number;
  couponDiscount: number;
  deliveryFee: number;
  total: number;
  freeDelivery: boolean;
  zone: { key: string; name: string; etaDays: string | null } | null;
  coupon: { code: string; type: string; discount: number; freeDelivery: boolean } | null;
  couponError: { reason: string; message: string } | null;
  warnings: { code: LineIssue; productId: string; sku: string; message: string }[];
  /** What would be taken from stock for the live lines (bundles expand into their parts). Server-internal. */
  stockPlan: StockPlanEntry[];
  couponResult: CouponResult | null;
}

interface Options { session?: ClientSession; now?: Date }

type Settings = Awaited<ReturnType<typeof loadSettings>>;
export const loadSettings = (session?: ClientSession) => WebsiteSettings.findOne({ key: 'main' }, null, { session }).lean();

export function resolveZone(settings: NonNullable<Settings>, input: { district?: string; zoneKey?: string }) {
  const zones = (settings.delivery?.zones ?? []).filter((z) => z.active);
  if (zones.length === 0) throw new AppError(503, 'DELIVERY_NOT_CONFIGURED', 'Delivery is not configured yet. Please contact us.');
  if (input.district) {
    const d = input.district.trim().toLowerCase();
    const byDistrict = zones.find((z) => z.districts.some((x) => x.toLowerCase() === d));
    if (byDistrict) return byDistrict;
  } else if (input.zoneKey) {
    const byKey = zones.find((z) => z.key === input.zoneKey);
    if (byKey) return byKey;
  }
  return zones.find((z) => z.key === settings.delivery?.defaultZoneKey) ?? zones[zones.length - 1]!;
}

/**
 * The single source of truth for money. Every price comes from the database; nothing about prices, discounts,
 * delivery fees or availability is ever read from the client. Used by /cart/quote and by checkout (inside its transaction).
 */
export async function buildQuote(input: QuoteInput, opts: Options = {}): Promise<Quote> {
  const now = opts.now ?? new Date();
  const { session } = opts;

  // merge duplicate (product, sku) lines
  const merged = new Map<string, { productId: string; sku: string; qty: number }>();
  for (const it of input.items) {
    const key = `${it.productId}:${it.sku}`;
    const cur = merged.get(key);
    merged.set(key, cur ? { ...cur, qty: cur.qty + it.qty } : { ...it });
  }
  const wanted = [...merged.values()];

  const products = (await Product.find({ _id: trusted({ $in: wanted.map((w) => w.productId) }), deletedAt: null, visibility: 'published' }, null, { session }).lean()) as unknown as ProductObj[];
  const compIds = [...new Set(products.flatMap((p) => p.bundleItems.map((b) => String(b.product))))];
  const compDocs = compIds.length ? ((await Product.find({ _id: trusted({ $in: compIds }), deletedAt: null }, null, { session }).lean()) as unknown as ProductObj[]) : [];
  const comps = new Map(compDocs.map((c) => [String(c._id), c]));

  const settings = await loadSettings(session);
  if (!settings) throw new AppError(503, 'NOT_CONFIGURED', 'The shop is not configured yet. Please contact us.');
  const zone = resolveZone(settings, input);

  const warnings: Quote['warnings'] = [];
  const stockPlan = new Map<string, StockPlanEntry>();
  const addPlan = (productId: string, sku: string, qty: number) => {
    const k = `${productId}:${sku}`;
    const cur = stockPlan.get(k);
    stockPlan.set(k, cur ? { ...cur, qty: cur.qty + qty } : { productId, sku, qty });
  };

  const lines: QuoteLine[] = wanted.map((w) => {
    const p = products.find((x) => String(x._id) === w.productId);
    const v = p?.variants.find((x) => x.sku === w.sku && x.isActive);
    const base = { productId: w.productId, sku: w.sku, requestedQty: w.qty };
    if (!p || !v) {
      warnings.push({ code: 'ITEM_UNAVAILABLE', productId: w.productId, sku: w.sku, message: 'This item is no longer available.' });
      return { ...base, name: p?.name ?? 'Unavailable item', nameBn: p?.nameBn ?? null, image: null, isBundle: false, qty: 0, maxQty: 0, unitPrice: 0, regularPrice: 0, lineTotal: 0, freeDelivery: false, unavailable: true, issue: 'ITEM_UNAVAILABLE' as const };
    }
    const isBundle = p.type === 'bundle';
    const available = isBundle ? bundleAvailable(p, comps) : variantAvailable(p, v);
    const cap = Math.min(available, p.maxPerOrder ?? MAX_QTY_PER_LINE, MAX_QTY_PER_LINE);
    const { price } = effectivePrice(v, now);
    const common = { ...base, name: p.name, nameBn: p.nameBn ?? null, image: p.images[0]?.url ?? null, isBundle, maxQty: cap, unitPrice: price, regularPrice: v.regularPrice, freeDelivery: p.freeDelivery };
    if (cap <= 0) {
      warnings.push({ code: 'ITEM_UNAVAILABLE', productId: w.productId, sku: w.sku, message: `${p.name} is out of stock.` });
      return { ...common, qty: 0, lineTotal: 0, unavailable: true, issue: 'ITEM_UNAVAILABLE' as const };
    }
    const qty = Math.min(w.qty, cap);
    let issue: LineIssue | null = null;
    if (qty < w.qty) {
      issue = 'STOCK_REDUCED';
      warnings.push({ code: 'STOCK_REDUCED', productId: w.productId, sku: w.sku, message: `Only ${qty} of ${p.name} can be ordered right now.` });
    }
    if (isBundle) for (const b of p.bundleItems) addPlan(String(b.product), b.sku, b.quantity * qty);
    else addPlan(w.productId, w.sku, qty);
    return { ...common, qty, lineTotal: price * qty, unavailable: false, issue };
  });

  const live = lines.filter((l) => !l.unavailable);
  const subtotal = live.reduce((s, l) => s + l.regularPrice * l.qty, 0);
  const afterProduct = live.reduce((s, l) => s + l.lineTotal, 0);
  const productDiscount = subtotal - afterProduct;

  let couponResult: CouponResult | null = null;
  if (input.couponCode && live.length > 0) {
    couponResult = await evaluateCoupon(input.couponCode, {
      subtotalAfterProductDiscount: afterProduct,
      lines: live.map((l) => ({ productId: l.productId, lineTotal: l.lineTotal })),
      phone: input.phone, now, session,
    });
  }
  const couponDiscount = couponResult?.valid ? couponResult.discount : 0;
  const afterCoupon = afterProduct - couponDiscount;

  const freeByProduct = live.some((l) => l.freeDelivery);
  const freeByCoupon = Boolean(couponResult?.valid && couponResult.freeDelivery);
  const freeByThreshold = zone.freeOver != null && afterCoupon >= zone.freeOver;
  const freeDelivery = live.length > 0 && (freeByProduct || freeByCoupon || freeByThreshold);
  const deliveryFee = live.length === 0 || freeDelivery ? 0 : zone.fee;

  return {
    lines, subtotal, productDiscount, couponDiscount, deliveryFee, total: afterCoupon + deliveryFee, freeDelivery,
    zone: { key: zone.key, name: zone.name, etaDays: zone.etaDays ?? null },
    coupon: couponResult?.valid ? { code: couponResult.code, type: couponResult.type, discount: couponResult.discount, freeDelivery: couponResult.freeDelivery } : null,
    couponError: couponResult && !couponResult.valid ? { reason: couponResult.reason, message: couponResult.message } : null,
    warnings, stockPlan: [...stockPlan.values()], couponResult,
  };
}

/** Public shape: strips server-internal fields. */
export function publicQuote(q: Quote) {
  const { stockPlan: _plan, couponResult: _result, ...rest } = q;
  void _plan; void _result;
  return rest;
}
