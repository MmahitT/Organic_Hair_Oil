import { useCallback } from 'react';
import { useCart } from '@/store/cart';
import { useShop } from './useShop';

/** "Order now": adds the featured offer and opens the cart; falls back to the product list if there is none. */
export function useOrderNow() {
  const { featured } = useShop();
  const add = useCart((s) => s.add);
  const open = useCart((s) => s.open);
  const canOrder = Boolean(featured && featured.maxQty > 0);
  const orderNow = useCallback(() => {
    if (featured && featured.maxQty > 0) { add(featured); open(); }
    else document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
  }, [featured, add, open]);
  return { featured, canOrder, orderNow };
}
