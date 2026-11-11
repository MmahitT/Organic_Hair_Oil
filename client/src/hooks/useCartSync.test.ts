import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCart } from '@/store/cart';
import type { PublicProduct, Quote } from '@/types/api';
import { useCartSync } from './useCartSync';

const prod = { id: 'p1', variants: [{ sku: 'S1', maxQty: 10 }] } as unknown as PublicProduct;
const quote = (qty: number, issue: 'STOCK_REDUCED' | null): Quote => ({ lines: [{ productId: 'p1', sku: 'S1', qty, issue }] } as unknown as Quote);

describe('useCartSync', () => {
  beforeEach(() => { useCart.setState({ lines: [], zoneKey: null, couponCode: null, isOpen: false }); useCart.getState().add(prod, 3); });

  it('lowers the cart quantity to what the server can supply and keeps remembering the adjustment', () => {
    const { result, rerender } = renderHook(({ q }) => useCartSync(q), { initialProps: { q: quote(1, 'STOCK_REDUCED') as Quote | null } });
    expect(useCart.getState().lines[0]?.qty).toBe(1);
    expect(result.current).toEqual([{ productId: 'p1', sku: 'S1', qty: 1 }]);
    act(() => rerender({ q: quote(1, null) })); // next quote: no warning any more
    expect(result.current).toHaveLength(1); // …but the customer is still told why
  });
  it('does nothing when no quantity was reduced', () => {
    const { result } = renderHook(() => useCartSync(quote(3, null)));
    expect(useCart.getState().lines[0]?.qty).toBe(3);
    expect(result.current).toEqual([]);
  });
});
