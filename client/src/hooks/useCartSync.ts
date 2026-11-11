import { useEffect, useState } from 'react';
import { useCart } from '@/store/cart';
import type { Quote } from '@/types/api';

export interface Adjustment { productId: string; sku: string; qty: number }

/**
 * When the server lowers a quantity (limited stock), mirror that in the cart so what the customer sees is what is
 * sent — and remember it, because after the correction the next quote no longer carries a warning and the customer
 * would otherwise never learn why their quantity changed.
 */
export function useCartSync(quote: Quote | null): Adjustment[] {
  const setQty = useCart((s) => s.setQty);
  const [adjusted, setAdjusted] = useState<Adjustment[]>([]);
  useEffect(() => {
    if (!quote) return;
    const hits: Adjustment[] = [];
    for (const l of quote.lines) {
      if (l.issue === 'STOCK_REDUCED' && l.qty > 0) { setQty(l.productId, l.sku, l.qty); hits.push({ productId: l.productId, sku: l.sku, qty: l.qty }); }
    }
    if (hits.length) setAdjusted((prev) => [...prev.filter((p) => !hits.some((h) => h.productId === p.productId && h.sku === p.sku)), ...hits]);
  }, [quote, setQty]);
  return adjusted;
}
