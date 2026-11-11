import { describe, expect, it } from 'vitest';
import type { PublicProduct } from '@/types/api';
import { computeTotals, resolveLines } from './pricing';
import { orderMessage, whatsappUrl } from './whatsapp';

const combo: PublicProduct = {
  id: 'c1', slug: 'combo', type: 'bundle', name: 'Combo: Oil + Powder + Free Comb', nameBn: 'কম্বো', shortDescription: null, shortDescriptionBn: null, description: null, descriptionBn: null,
  images: [], variants: [{ sku: 'COMBO', label: 'Combo', sizeValue: null, sizeUnit: null, price: 999, compareAtPrice: null, stockStatus: 'in_stock', maxQty: 5 }],
  price: 999, compareAtPrice: null, stockStatus: 'in_stock', maxQty: 5, freeDelivery: true, isFeatured: true, bundle: [], bundleValue: 1200, ingredients: [],
};
const zone = { key: 'outside_rangpur', name: 'Outside Rangpur', fee: 120, etaDays: null };

describe('whatsapp', () => {
  it('builds a wa.me link with the given number and encoded text', () => {
    expect(whatsappUrl('8801857164863', 'hi there')).toBe('https://wa.me/8801857164863?text=hi%20there');
  });
  it('lists items and a free delivery total for the combo', () => {
    const r = resolveLines([{ productId: 'c1', sku: 'COMBO', qty: 1 }], [combo]);
    const msg = orderMessage(r, zone, computeTotals(r, zone), 'en');
    expect(msg).toContain('Combo: Oil + Powder + Free Comb × 1 = ৳999');
    expect(msg).toContain('Delivery: Free');
    expect(msg).toContain('Total: ৳999');
    expect(msg).toContain('Delivery area: Outside Rangpur');
  });
  it('uses the Bangla name and digits in Bangla', () => {
    const r = resolveLines([{ productId: 'c1', sku: 'COMBO', qty: 2 }], [combo]);
    expect(orderMessage(r, zone, computeTotals(r, zone), 'bn')).toContain('কম্বো × 2 = ৳১,৯৯৮');
  });
});
