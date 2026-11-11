import type { PublicProduct, PublicSettings, PublicVariant } from '@/types/api';

export interface CartLine { productId: string; sku: string; qty: number }
export type Zone = PublicSettings['delivery']['zones'][number];

export interface ResolvedLine {
  line: CartLine;
  product: PublicProduct;
  variant: PublicVariant;
  qty: number; // effective quantity after applying the server's per-line maximum
  unavailable: boolean; // out of stock right now — excluded from totals
  lineTotal: number;
}

export interface Totals { subtotal: number; deliveryFee: number; total: number; freeDelivery: boolean }

/** Joins cart lines (ids + qty only) with live catalogue data. Lines for products that no longer exist are dropped. */
export function resolveLines(lines: CartLine[], products: PublicProduct[]): ResolvedLine[] {
  const out: ResolvedLine[] = [];
  for (const line of lines) {
    const product = products.find((p) => p.id === line.productId);
    const variant = product?.variants.find((v) => v.sku === line.sku);
    if (!product || !variant) continue;
    const unavailable = variant.maxQty <= 0;
    const qty = unavailable ? line.qty : Math.min(line.qty, variant.maxQty);
    out.push({ line, product, variant, qty, unavailable, lineTotal: unavailable ? 0 : variant.price * qty });
  }
  return out;
}

/**
 * DISPLAY-ONLY estimate built from server-supplied prices and fees. The authoritative price, delivery fee and
 * total are recomputed by the server at checkout (Phase 5 `/cart/quote`); never submit these numbers.
 */
export function computeTotals(resolved: ResolvedLine[], zone: Zone | undefined): Totals {
  const live = resolved.filter((r) => !r.unavailable);
  const subtotal = live.reduce((s, r) => s + r.lineTotal, 0);
  const freeDelivery = live.some((r) => r.product.freeDelivery);
  const deliveryFee = live.length === 0 || freeDelivery ? 0 : (zone?.fee ?? 0);
  return { subtotal, deliveryFee, total: subtotal + deliveryFee, freeDelivery };
}
