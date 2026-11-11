import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api';
import type { CartLine } from '@/lib/pricing';
import type { Quote } from '@/types/api';

interface Params { lines: CartLine[]; couponCode: string | null; district?: string; zoneKey?: string | null; phone?: string; enabled?: boolean }
type Status = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Asks the SERVER to price the cart (prices, discounts, delivery fee, coupon, stock). The UI shows only these
 * numbers. Re-prices (debounced) whenever the cart, coupon or delivery area changes; stale responses are discarded.
 */
export function useQuote({ lines, couponCode, district, zoneKey, phone, enabled = true }: Params) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const [tick, setTick] = useState(0);

  const key = JSON.stringify([lines, couponCode, district, zoneKey, phone]);
  useEffect(() => {
    if (!enabled || lines.length === 0) { setQuote(null); setStatus('idle'); return; }
    const id = ++seq.current;
    setStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const r = await apiFetch<Quote>('/cart/quote', {
          method: 'POST',
          body: {
            items: lines.map((l) => ({ productId: l.productId, sku: l.sku, qty: l.qty })),
            ...(couponCode ? { couponCode } : {}), ...(district ? { district } : zoneKey ? { zoneKey } : {}), ...(phone ? { phone } : {}),
          },
        });
        if (id !== seq.current) return;
        setQuote(r.data); setError(null); setStatus('ready');
      } catch (e) {
        if (id !== seq.current) return;
        setError(e instanceof ApiError ? e.message : 'Could not update prices'); setStatus('error');
      }
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { quote, status, error, refresh };
}
