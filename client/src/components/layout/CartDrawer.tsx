import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CouponBox } from '@/components/shop/CouponBox';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ProductImage } from '@/components/ui/ProductImage';
import { useCartSync } from '@/hooks/useCartSync';
import { useQuote } from '@/hooks/useQuote';
import { useShop } from '@/hooks/useShop';
import { useCheckoutT, useT } from '@/hooks/useT';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { computeTotals, resolveLines } from '@/lib/pricing';
import { pName } from '@/lib/productText';
import { orderMessage } from '@/lib/whatsapp';
import { useCart } from '@/store/cart';

export function CartDrawer() {
  const { t, lang, money } = useT();
  const { products, zones, wa, hasWhatsapp } = useShop();
  const c = useCheckoutT();
  const nav = useNavigate();
  const { lines, zoneKey, couponCode, isOpen, close, setQty, remove, clear, setZone, setCoupon } = useCart();
  const closeRef = useRef<HTMLButtonElement>(null);

  const resolved = useMemo(() => resolveLines(lines, products), [lines, products]);
  const zone = zones.find((z) => z.key === zoneKey) ?? zones.find((z) => z.key === 'outside_rangpur') ?? zones[0];
  const hasLive = resolved.some((r) => !r.unavailable);
  // Prices, discounts, delivery and coupon are decided by the server; the local estimate is only a placeholder.
  const { quote, status: qStatus } = useQuote({ lines, couponCode, zoneKey: zone?.key, enabled: isOpen });
  useCartSync(quote);
  const local = computeTotals(resolved, zone);
  const totals = quote ? { subtotal: quote.subtotal, deliveryFee: quote.deliveryFee, total: quote.total, freeDelivery: quote.freeDelivery } : local;
  const loading = qStatus === 'loading';

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [isOpen, close]);

  return (
    <div ref={(el) => { if (el) el.inert = !isOpen; }} className={cn('fixed inset-0 z-50', !isOpen && 'pointer-events-none')} aria-hidden={!isOpen}>
      <div onClick={close} className={cn('absolute inset-0 bg-charcoal/50 transition-opacity duration-300', isOpen ? 'opacity-100' : 'opacity-0')} />
      <aside
        role="dialog" aria-modal="true" aria-label={t.cart.title}
        className={cn('absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-cream shadow-2xl transition-transform duration-300', isOpen ? 'translate-x-0' : 'translate-x-full')}
      >
        <div className="flex items-center justify-between border-b border-sage/40 px-5 py-4">
          <h2 className="text-xl font-bold">{t.cart.title}</h2>
          <button ref={closeRef} type="button" onClick={close} aria-label={t.nav.close} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-sage-light">
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        {resolved.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <ShoppingBag aria-hidden className="h-12 w-12 text-sage" />
            <p className="text-charcoal-soft">{t.cart.empty}</p>
            <ButtonLink href="#products" onClick={close}>{t.cart.emptyCta}</ButtonLink>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-sage/40 overflow-y-auto px-5">
              {resolved.map((r) => (
                <li key={`${r.line.productId}-${r.line.sku}`} className={cn('flex gap-3 py-4', r.unavailable && 'opacity-60')}>
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white">
                    {r.product.images[0] && <ProductImage src={r.product.images[0].url} alt="" className="object-contain" sizes="80px" targetWidth={160} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">{pName(r.product, lang)}</p>
                    {r.unavailable
                      ? <p className="text-xs font-semibold text-danger">{t.stock.out}</p>
                      : r.product.bundle.some((b) => b.isGift) && <p className="text-xs text-forest">{t.cart.giftNote}</p>}
                    <p className="mt-0.5 text-sm text-charcoal-soft">{money(r.variant.price)}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <div role="group" aria-label={t.cart.qty} className="inline-flex items-center rounded-full border border-forest/30 bg-white">
                        <button type="button" aria-label={t.cart.dec} disabled={r.unavailable || r.qty <= 1} onClick={() => setQty(r.line.productId, r.line.sku, r.qty - 1)} className="flex h-10 w-10 items-center justify-center text-forest disabled:opacity-40"><Minus aria-hidden className="h-4 w-4" /></button>
                        <span aria-live="polite" className="w-7 text-center text-sm font-semibold">{formatNumber(r.qty, lang)}</span>
                        <button type="button" aria-label={t.cart.inc} disabled={r.unavailable || r.qty >= r.variant.maxQty} onClick={() => setQty(r.line.productId, r.line.sku, r.qty + 1)} className="flex h-10 w-10 items-center justify-center text-forest disabled:opacity-40"><Plus aria-hidden className="h-4 w-4" /></button>
                      </div>
                      <button type="button" onClick={() => remove(r.line.productId, r.line.sku)} aria-label={`${t.cart.remove}: ${pName(r.product, lang)}`} className="flex h-10 w-10 items-center justify-center rounded-full text-danger hover:bg-danger/10"><Trash2 aria-hidden className="h-4 w-4" /></button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="space-y-3 border-t border-sage/40 bg-white px-5 py-4">
              {zones.length > 0 && (
                <fieldset>
                  <legend className="mb-1.5 text-sm font-semibold">{t.cart.zone}</legend>
                  <div className={cn('grid gap-2', zones.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
                    {zones.map((z) => (
                      <label key={z.key} className={cn('flex min-h-11 cursor-pointer items-center justify-center rounded-full border px-3 text-sm font-medium', zone?.key === z.key ? 'border-forest bg-forest text-white' : 'border-forest/30 text-forest')}>
                        <input type="radio" name="zone" value={z.key} checked={zone?.key === z.key} onChange={() => setZone(z.key)} className="sr-only" />
                        {z.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <CouponBox code={couponCode} quote={quote} loading={loading} onApply={setCoupon} onRemove={() => setCoupon(null)} />
              <dl className={cn('space-y-1 text-sm transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
                <div className="flex justify-between"><dt>{t.cart.subtotal}</dt><dd>{money(totals.subtotal)}</dd></div>
                {quote && quote.productDiscount > 0 && <div className="flex justify-between text-forest"><dt>{c.productDiscount}</dt><dd>−{money(quote.productDiscount)}</dd></div>}
                {quote && quote.couponDiscount > 0 && <div className="flex justify-between text-forest"><dt>{c.couponDiscount}</dt><dd>−{money(quote.couponDiscount)}</dd></div>}
                <div className="flex justify-between"><dt>{t.cart.delivery}</dt><dd className={cn(totals.deliveryFee === 0 && hasLive && 'font-semibold text-forest')}>{!hasLive ? '—' : totals.deliveryFee === 0 ? t.cart.free : money(totals.deliveryFee)}</dd></div>
                <div className="flex justify-between border-t border-sage/40 pt-2 text-base font-bold"><dt>{t.cart.total}</dt><dd>{money(totals.total)}</dd></div>
              </dl>
              <Button full size="lg" disabled={!hasLive || !quote || quote.lines.some((l) => l.unavailable)} onClick={() => { close(); nav('/checkout'); }}>{c.title}</Button>
              {hasWhatsapp && hasLive && (
                <ButtonLink full variant="outline" href={wa(orderMessage(resolved, zone, totals, lang))} target="_blank" rel="noopener noreferrer">{t.cart.orderWa}</ButtonLink>
              )}
              <Button full variant="ghost" onClick={clear}>{t.cart.clear}</Button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
