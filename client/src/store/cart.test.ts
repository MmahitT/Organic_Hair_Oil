import { beforeEach, describe, expect, it } from 'vitest';
import type { PublicProduct } from '@/types/api';
import { useCart } from './cart';

const mk = (id: string, maxQty = 10): PublicProduct => ({
  id, slug: id, type: 'simple', name: id, nameBn: null, shortDescription: null, shortDescriptionBn: null, description: null, descriptionBn: null, images: [],
  variants: [{ sku: id.toUpperCase(), label: 'x', sizeValue: null, sizeUnit: null, price: 100, compareAtPrice: null, stockStatus: 'in_stock', maxQty }],
  price: 100, compareAtPrice: null, stockStatus: 'in_stock', maxQty, freeDelivery: false, isFeatured: false, bundle: [], bundleValue: null, ingredients: [],
});

describe('cart store', () => {
  beforeEach(() => useCart.setState({ lines: [], zoneKey: null, couponCode: null, isOpen: false }));

  it('adds and merges lines by product + sku', () => {
    useCart.getState().add(mk('oil'));
    useCart.getState().add(mk('oil'));
    expect(useCart.getState().lines).toEqual([{ productId: 'oil', sku: 'OIL', qty: 2 }]);
  });
  it('never adds out-of-stock products and caps at the product maximum', () => {
    useCart.getState().add(mk('gone', 0));
    expect(useCart.getState().lines).toHaveLength(0);
    useCart.getState().add(mk('few', 2), 5);
    expect(useCart.getState().lines[0]?.qty).toBe(2);
  });
  it('clamps manual quantity changes to 1..10', () => {
    useCart.getState().add(mk('comb'));
    useCart.getState().setQty('comb', 'COMB', 0);
    expect(useCart.getState().lines[0]?.qty).toBe(1);
    useCart.getState().setQty('comb', 'COMB', 999);
    expect(useCart.getState().lines[0]?.qty).toBe(10);
  });
  it('clearing the cart also clears the coupon', () => {
    useCart.getState().add(mk('oil'));
    useCart.getState().setCoupon('SAVE10');
    useCart.getState().clear();
    expect(useCart.getState().couponCode).toBeNull();
  });
  it('removes lines', () => {
    useCart.getState().add(mk('powder'));
    useCart.getState().remove('powder', 'POWDER');
    expect(useCart.getState().lines).toHaveLength(0);
  });
  it('reconcile drops lines whose product disappeared from the catalogue', () => {
    useCart.getState().add(mk('oil'));
    useCart.getState().add(mk('old'));
    useCart.getState().reconcile([mk('oil')]);
    expect(useCart.getState().lines.map((l) => l.productId)).toEqual(['oil']);
  });
});
