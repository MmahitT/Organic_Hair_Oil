import { describe, expect, it } from 'vitest';
import type { PublicProduct } from '@/types/api';
import { computeTotals, resolveLines } from './pricing';

const mk = (id: string, price: number, over: Partial<PublicProduct> = {}, maxQty = 10): PublicProduct => ({
  id, slug: id, type: 'simple', name: id, nameBn: null, shortDescription: null, shortDescriptionBn: null, description: null, descriptionBn: null,
  images: [], variants: [{ sku: id.toUpperCase(), label: 'x', sizeValue: null, sizeUnit: null, price, compareAtPrice: null, stockStatus: 'in_stock', maxQty }],
  price, compareAtPrice: null, stockStatus: 'in_stock', maxQty, freeDelivery: false, isFeatured: false, bundle: [], bundleValue: null, ingredients: [], ...over,
});
const oil = mk('oil', 550);
const comb = mk('comb', 150);
const combo = mk('combo', 999, { type: 'bundle', freeDelivery: true });
const products = [oil, comb, combo];
const dhaka = { key: 'inside_rangpur', name: 'Inside Rangpur', fee: 60, etaDays: null };
const outside = { key: 'outside_rangpur', name: 'Outside Rangpur', fee: 120, etaDays: null };
const line = (id: string, qty = 1) => ({ productId: id, sku: id.toUpperCase(), qty });

describe('computeTotals (display-only estimate from server prices)', () => {
  it('charges the zone fee for non-combo orders', () => {
    expect(computeTotals(resolveLines([line('oil')], products), dhaka)).toEqual({ subtotal: 550, deliveryFee: 60, total: 610, freeDelivery: false });
    expect(computeTotals(resolveLines([line('oil'), line('comb')], products), outside).total).toBe(820);
  });
  it('makes delivery free when a free-delivery product (combo) is present', () => {
    const t = computeTotals(resolveLines([line('combo'), line('comb')], products), outside);
    expect(t).toEqual({ subtotal: 1149, deliveryFee: 0, total: 1149, freeDelivery: true });
  });
  it('has no delivery fee for an empty cart', () => {
    expect(computeTotals([], dhaka).total).toBe(0);
  });
  it('drops lines for products that no longer exist', () => {
    expect(resolveLines([line('oil'), line('ghost')], products)).toHaveLength(1);
  });
  it('clamps quantity to the server maximum and excludes out-of-stock lines from totals', () => {
    const limited = [mk('oil', 550, {}, 3), mk('comb', 150, {}, 0)];
    const r = resolveLines([line('oil', 9), line('comb', 2)], limited);
    expect(r[0]).toMatchObject({ qty: 3, unavailable: false, lineTotal: 1650 });
    expect(r[1]).toMatchObject({ unavailable: true, lineTotal: 0 });
    expect(computeTotals(r, dhaka).subtotal).toBe(1650);
  });
  it('uses the discounted price the server sends', () => {
    const sale = mk('oil', 450);
    expect(computeTotals(resolveLines([line('oil', 2)], [sale]), dhaka).subtotal).toBe(900);
  });
});
