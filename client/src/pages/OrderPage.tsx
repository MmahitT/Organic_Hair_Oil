import { CheckCircle2, Copy, MessageCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';
import { CheckoutHeader } from '@/components/shop/CheckoutHeader';
import { PaymentPanel } from '@/components/shop/PaymentPanel';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ProductImage } from '@/components/ui/ProductImage';
import { useShop } from '@/hooks/useShop';
import { useCheckoutT, useOrdersT, usePayT, useT } from '@/hooks/useT';
import { COUNTS_AS_PURCHASE, firstTimePurchase, track } from '@/lib/analytics';
import { ApiError, apiFetch } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { useCatalog } from '@/store/catalog';
import type { OrderStatusData } from '@/types/api';

const tokenKey = (orderNo: string) => `bo-order-token:${orderNo}`;

/** Reads the signed token from the URL fragment (never sent to servers/referrers) or sessionStorage, then hides it. */
function readToken(orderNo: string): string | null {
  let token: string | null = null;
  const m = /[#&]t=([^&]+)/.exec(window.location.hash);
  if (m?.[1]) { token = decodeURIComponent(m[1]); try { sessionStorage.setItem(tokenKey(orderNo), token); } catch { /* ignore */ } history.replaceState(null, '', window.location.pathname); }
  if (!token) { try { token = sessionStorage.getItem(tokenKey(orderNo)); } catch { token = null; } }
  return token;
}

type State = { kind: 'loading' } | { kind: 'ok'; order: OrderStatusData; token: string } | { kind: 'invalid' } | { kind: 'error'; limited?: boolean };

export default function OrderPage() {
  const { orderNo = '' } = useParams();
  const c = useCheckoutT();
  const o = c.order;
  const pay = usePayT();
  const ord = useOrdersT().orderPage;
  const { lang, money } = useT();
  const { wa, hasWhatsapp } = useShop();
  const loadCatalog = useCatalog((s) => s.load);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [copied, setCopied] = useState(false);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  // `quiet` refreshes (polling, after a payment action) keep the page on screen instead of flashing a spinner.
  const load = useCallback(async (quiet = false) => {
    const token = readToken(orderNo);
    if (!token) return setState({ kind: 'invalid' });
    if (!quiet) setState({ kind: 'loading' });
    try {
      const r = await apiFetch<OrderStatusData>(`/orders/${encodeURIComponent(orderNo)}/status`, { query: { token } });
      setState({ kind: 'ok', order: r.data, token });
    } catch (e) {
      if (quiet) return;
      setState(e instanceof ApiError && (e.status === 401 || e.status === 404 || e.status === 400) ? { kind: 'invalid' } : { kind: 'error', limited: e instanceof ApiError && e.status === 429 });
    }
  }, [orderNo]);
  // Start the first load once per order (an effect can run twice in a row; each extra call would also count against the rate limit).
  const started = useRef<string | null>(null);
  useEffect(() => { if (started.current === orderNo) return; started.current = orderNo; void load(); }, [load, orderNo]);
  const refresh = useCallback(() => { void load(true); }, [load]);

  // A purchase is reported only once the shop has accepted the order (confirmed or later), and only once per order number.
  const order = state.kind === 'ok' ? state.order : null;
  useEffect(() => {
    if (order && COUNTS_AS_PURCHASE.includes(order.status) && firstTimePurchase(order.orderNo)) {
      track('purchase', { transaction_id: order.orderNo, value: order.total, items: order.items.map((i) => ({ item_id: i.name, item_name: i.name, price: i.unitPrice, quantity: i.quantity })) });
    }
  }, [order]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(orderNo); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
  };
  const waLink = hasWhatsapp ? wa(o.waMessage.replace('{orderNo}', orderNo)) : null;

  return (
    <>
      <Helmet><title>{o.title} — Beauty Organic Hair Oil</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <CheckoutHeader title={o.title} />
      <main className="container-page max-w-2xl py-8 sm:py-12">
        {state.kind === 'loading' && <p role="status" className="py-16 text-center text-charcoal-soft">{o.loading}</p>}

        {state.kind === 'error' && (
          <div className="rounded-xl2 bg-white p-8 text-center shadow-card">
            <h1 className="text-2xl font-bold">{o.errorTitle}</h1>
            <p className="mt-2 text-charcoal-soft">{state.limited ? c.err.RATE_LIMITED : o.errorText}</p>
            <p className="mt-3 font-mono text-sm">{orderNo}</p>
            <Button className="mt-5" onClick={() => void load()}>{o.retry}</Button>
          </div>
        )}

        {state.kind === 'invalid' && (
          <div className="rounded-xl2 bg-white p-8 text-center shadow-card">
            <h1 className="text-2xl font-bold">{o.invalidTitle}</h1>
            <p className="mt-2 text-charcoal-soft">{o.invalidText}</p>
            <p className="mt-3 font-mono text-sm">{orderNo}</p>
            <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
              {waLink && <ButtonLink href={waLink} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden className="h-4 w-4" />{o.whatsapp}</ButtonLink>}
              <ButtonLink variant="outline" href="/">{o.continue}</ButtonLink>
            </div>
          </div>
        )}

        {state.kind === 'ok' && (() => {
          const d = state.order;
          return (
            <div className="space-y-5">
              <div className="rounded-xl2 bg-white p-6 text-center shadow-card sm:p-8">
                <CheckCircle2 aria-hidden className="mx-auto h-14 w-14 text-forest" />
                <h1 className="mt-3 text-2xl font-bold sm:text-3xl">{o.thanks}</h1>
                <p className="mt-5 text-sm text-charcoal-soft">{o.number}</p>
                <div className="mt-1 flex items-center justify-center gap-2">
                  <span className="font-mono text-2xl font-bold tracking-wide text-forest" data-testid="order-no">{d.orderNo}</span>
                  <button type="button" onClick={() => void copy()} aria-label={o.copy} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-forest/30 px-3 text-xs font-semibold text-forest hover:bg-sage-light"><Copy aria-hidden className="h-3.5 w-3.5" />{copied ? o.copied : o.copy}</button>
                </div>
                <p className="mt-2 text-xs text-charcoal-soft">{o.placedOn} {new Date(d.createdAt).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB')}</p>
                <p className="mt-4 inline-block rounded-full bg-sage-light px-4 py-1.5 text-sm font-semibold text-forest">{o.statuses[d.status] ?? d.status}</p>
              </div>

              <PaymentPanel order={d} token={state.token} onChanged={refresh} />

              <div className="rounded-xl2 bg-white p-5 shadow-card sm:p-6">
                <h2 className="text-lg font-bold">{o.next}</h2>
                <p className="mt-1 text-charcoal-soft">{o.nextText}</p>
                {d.paymentMethod === 'cod' && <p className="mt-3 rounded-lg bg-gold/15 p-3 text-sm font-medium text-gold-dark">{o.codNote}</p>}
              </div>

              <div className="rounded-xl2 bg-white p-5 shadow-card sm:p-6">
                <h2 className="mb-2 text-lg font-bold">{o.items}</h2>
                <ul className="divide-y divide-sage/40">
                  {d.items.map((i) => (
                    <li key={i.name} className="flex items-center gap-3 py-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-cream-dark">{i.image && <ProductImage src={i.image} alt="" className="object-contain" targetWidth={140} />}</div>
                      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{i.name}</p><p className="text-xs text-charcoal-soft">{money(i.unitPrice)} × {formatNumber(i.quantity, lang)}</p></div>
                      <p className="text-sm font-semibold">{money(i.lineTotal)}</p>
                    </li>
                  ))}
                </ul>
                <dl className="mt-3 space-y-1.5 border-t border-sage/40 pt-3 text-sm">
                  <div className="flex justify-between"><dt>{c.subtotal}</dt><dd>{money(d.subtotal)}</dd></div>
                  {d.productDiscount > 0 && <div className="flex justify-between text-forest"><dt>{c.productDiscount}</dt><dd>−{money(d.productDiscount)}</dd></div>}
                  {d.couponDiscount > 0 && <div className="flex justify-between text-forest"><dt>{c.couponDiscount}</dt><dd>−{money(d.couponDiscount)}</dd></div>}
                  <div className="flex justify-between"><dt>{c.deliveryFee}</dt><dd className={d.deliveryFee === 0 ? 'font-semibold text-forest' : ''}>{d.deliveryFee === 0 ? c.free : money(d.deliveryFee)}</dd></div>
                  <div className="flex justify-between border-t border-sage/40 pt-2 text-lg font-bold"><dt>{c.total}</dt><dd>{money(d.total)}</dd></div>
                </dl>
              </div>

              <div className="rounded-xl2 bg-white p-5 text-sm shadow-card sm:p-6">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div><dt className="text-charcoal-soft">{o.deliverTo}</dt><dd className="font-semibold">{d.customer.firstName} · {d.customer.district}{d.deliveryZone ? ` (${d.deliveryZone})` : ''}</dd></div>
                  <div><dt className="text-charcoal-soft">{o.contactVia}</dt><dd className="font-semibold">{d.customer.phoneMasked}</dd></div>
                  <div><dt className="text-charcoal-soft">{o.payment}</dt><dd className="font-semibold">{d.paymentMethod === 'cod' ? o.paymentCod : (pay.names[d.paymentMethod] ?? d.paymentMethod)}</dd></div>
                </dl>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                {waLink && <ButtonLink size="lg" href={waLink} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden className="h-5 w-5" />{o.whatsapp}</ButtonLink>}
                <Link to={`/track?order=${d.orderNo}`} className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-forest px-7 text-base font-semibold text-forest hover:bg-forest hover:text-white">{ord.trackOrder}</Link>
                <a href={`${import.meta.env.VITE_API_BASE_URL ?? '/api/v1'}/orders/${d.orderNo}/invoice?token=${encodeURIComponent(state.token)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-full px-5 text-base font-semibold text-forest hover:underline">{ord.invoice}</a>
                <Link to="/" className="inline-flex min-h-12 items-center justify-center rounded-full px-5 text-base font-semibold text-forest hover:underline">{o.continue}</Link>
              </div>
            </div>
          );
        })()}
      </main>
    </>
  );
}
