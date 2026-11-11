import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Landmark, Minus, Plus, Smartphone, Trash2, Truck, Wallet } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from '@/lib/zod';
import { CouponBox } from '@/components/shop/CouponBox';
import { PaymentDetails } from '@/components/shop/PaymentDetails';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Form';
import { ProductImage } from '@/components/ui/ProductImage';
import { useCartSync } from '@/hooks/useCartSync';
import { useQuote } from '@/hooks/useQuote';
import { useShop } from '@/hooks/useShop';
import { useCheckoutT, usePayT, useT } from '@/hooks/useT';
import { ApiError, apiFetch } from '@/lib/api';
import { itemsFor, track } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { normalizeBdPhone } from '@/lib/phone';
import { pName } from '@/lib/productText';
import { useCart } from '@/store/cart';
import { useCatalog } from '@/store/catalog';
import type { CheckoutResult, DeliveryInfo, PaymentMethodKey } from '@/types/api';

const DRAFT = 'bo-checkout-draft';
const IDEM = 'bo-idem';
type Draft = { name: string; phone: string; email: string; district: string; city: string; address: string; instructions: string };
const EMPTY: Draft = { name: '', phone: '', email: '', district: '', city: '', address: '', instructions: '' };

function loadDraft(): Draft {
  try { return { ...EMPTY, ...(JSON.parse(sessionStorage.getItem(DRAFT) ?? '{}') as Partial<Draft>) }; } catch { return EMPTY; }
}
// One idempotency key per distinct cart: a retry after a network failure replays safely instead of double-ordering.
function idempotencyKey(signature: string): string {
  try {
    const s = JSON.parse(sessionStorage.getItem(IDEM) ?? 'null') as { sig: string; key: string } | null;
    if (s?.sig === signature) return s.key;
  } catch { /* fall through */ }
  const key = crypto.randomUUID();
  try { sessionStorage.setItem(IDEM, JSON.stringify({ sig: signature, key })); } catch { /* ignore */ }
  return key;
}

/** The whole checkout form + live server-priced summary. Used by the /checkout page and by the order section on the landing page. */
export function CheckoutForm({ inline = false }: { inline?: boolean }) {
  const c = useCheckoutT();
  const pay = usePayT();
  const { t, lang, money } = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const nav = useNavigate();
  const { wa, hasWhatsapp } = useShop();
  const loadCatalog = useCatalog((s) => s.load);
  const { lines, couponCode, setCoupon, setQty, remove, clear } = useCart();

  const [delivery, setDelivery] = useState<DeliveryInfo | null>(null);
  const [banner, setBanner] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [dup, setDup] = useState<{ orderNo: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<PaymentMethodKey | null>(null);
  const [priceChanged, setPriceChanged] = useState(false);
  const lastTotal = useRef<number | null>(null);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useEffect(() => { void apiFetch<DeliveryInfo>('/delivery/zones').then((r) => setDelivery(r.data)).catch(() => setBanner({ tone: 'error', text: c.err.NETWORK })); }, [c.err.NETWORK]);

  const schema = useMemo(() => z.object({
    name: z.string().trim().min(2, c.v.name).max(80, c.v.name),
    phone: z.string().trim().refine((v) => normalizeBdPhone(v) !== null, c.v.phone),
    email: z.string().trim().refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), c.v.email),
    district: z.string().min(1, c.v.district),
    city: z.string().trim().min(2, c.v.city).max(80, c.v.city),
    address: z.string().trim().min(10, c.v.address).max(300, c.v.address),
    instructions: z.string().trim().max(300, c.v.instructions),
  }), [c]);

  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm<Draft>({ resolver: zodResolver(schema), defaultValues: loadDraft() });
  useEffect(() => {
    const sub = watch((v) => { try { sessionStorage.setItem(DRAFT, JSON.stringify(v)); } catch { /* ignore */ } });
    return () => sub.unsubscribe();
  }, [watch]);

  const district = watch('district');
  const phoneNorm = normalizeBdPhone(watch('phone') ?? '');
  const { quote, status: qStatus, refresh } = useQuote({ lines, couponCode, district: district || undefined, phone: phoneNorm ?? undefined });
  const adjusted = useCartSync(quote);

  // Tell the customer when the server total changed under them (e.g. price edited, coupon expired).
  useEffect(() => {
    if (quote && lastTotal.current !== null && lastTotal.current !== quote.total && priceChanged) setBanner({ tone: 'info', text: c.err.PRICE_CHANGED });
    if (quote) lastTotal.current = quote.total;
  }, [quote, priceChanged, c.err.PRICE_CHANGED]);

  // Only methods the owner enabled (and that can actually work) are offered; the server re-checks on submit.
  const methods = useMemo(() => {
    const m = delivery?.methods;
    const out: PaymentMethodKey[] = [];
    if (!m) return out;
    if (m.cod) out.push('cod');
    for (const k of m.manual) out.push(`manual_${k.channel}` as PaymentMethodKey);
    if (m.bank) out.push('manual_bank');
    return out;
  }, [delivery]);
  const method: PaymentMethodKey | null = chosen && methods.includes(chosen) ? chosen : methods[0] ?? null;
  const began = useRef(false);
  useEffect(() => {
    // one "begin checkout" per visit, once the server has priced the cart
    if (quote && !began.current && lines.length) { began.current = true; track('begin_checkout', { items: itemsFor(lines), value: quote.total }); }
  }, [quote, lines]);
  const hasUnavailable = Boolean(quote?.lines.some((l) => l.unavailable));
  const loading = qStatus === 'loading';
  const canSubmit = Boolean(quote) && !hasUnavailable && !busy && !isSubmitting && method !== null;

  const place = async (v: Draft, allowDuplicate = false) => {
    if (!quote || !method) return;
    setBusy(true); setBanner(null); setDup(null);
    track('add_payment_info', { items: itemsFor(lines), value: quote.total, payment_type: method });
    const sig = `${method}|${lines.map((l) => `${l.productId}:${l.sku}x${l.qty}`).sort().join('|')}`;
    try {
      const r = await apiFetch<CheckoutResult>('/checkout', {
        method: 'POST',
        body: {
          idempotencyKey: idempotencyKey(sig),
          items: lines.map((l) => ({ productId: l.productId, sku: l.sku, qty: l.qty })),
          customer: { name: v.name.trim(), phone: v.phone.trim(), ...(v.email.trim() ? { email: v.email.trim() } : {}), district: v.district, city: v.city.trim(), address: v.address.trim(), ...(v.instructions.trim() ? { instructions: v.instructions.trim() } : {}) },
          paymentMethod: method, ...(couponCode ? { couponCode } : {}), expectedTotal: quote.total, ...(allowDuplicate ? { allowDuplicate: true } : {}),
        },
      });
      try { sessionStorage.setItem(`bo-order-token:${r.data.orderNo}`, r.data.orderToken); sessionStorage.removeItem(IDEM); sessionStorage.removeItem(DRAFT); } catch { /* ignore */ }
      clear();
      nav(`/order/${r.data.orderNo}`, { replace: true });
    } catch (e) {
      if (!(e instanceof ApiError)) return setBanner({ tone: 'error', text: c.err.GENERIC });
      const code = e.code as keyof typeof c.err;
      if (e.status === 0) setBanner({ tone: 'error', text: c.err.NETWORK });
      else if (e.code === 'VALIDATION_ERROR' && e.details?.length) {
        let any = false;
        for (const d of e.details) {
          const field = d.path.replace(/^customer\./, '') as keyof Draft;
          if (field in EMPTY) { setError(field, { message: c.v[field as keyof typeof c.v] ?? d.message }); any = true; }
        }
        setBanner({ tone: 'error', text: any ? c.err.GENERIC : e.message });
      } else if (e.code === 'DUPLICATE_ORDER') setDup({ orderNo: String((e.details as unknown as { orderNo?: string })?.orderNo ?? '') });
      else if (e.code === 'PRICE_CHANGED') { setPriceChanged(true); setBanner({ tone: 'info', text: c.err.PRICE_CHANGED }); refresh(); }
      else if (e.code === 'INSUFFICIENT_STOCK') { setBanner({ tone: 'error', text: c.err.INSUFFICIENT_STOCK }); void loadCatalog(); refresh(); }
      else if (e.code === 'COUPON_INVALID') { setCoupon(null); setBanner({ tone: 'error', text: c.err.COUPON_INVALID }); refresh(); }
      else if (e.status === 429) setBanner({ tone: 'error', text: c.err.RATE_LIMITED });
      else setBanner({ tone: 'error', text: c.err[code] ?? e.message ?? c.err.GENERIC });
      if (inline) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); else window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally { setBusy(false); }
  };
  const onSubmit = handleSubmit((v) => place(v));

  return (
    <form id="checkout-form" ref={formRef} onSubmit={onSubmit} noValidate className="grid items-start gap-6 lg:grid-cols-[1fr_420px] lg:gap-10">
            <div className="space-y-6">
              {!inline && <h1 className="text-3xl font-bold">{c.title}</h1>}
              {banner && (
                <div role={banner.tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border p-4 text-sm', banner.tone === 'error' ? 'border-danger/40 bg-danger/5 text-danger' : 'border-gold/50 bg-gold/10 text-gold-dark')}>
                  <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /><p>{banner.text}{banner.tone === 'error' && hasWhatsapp && ['ACCOUNT_BLOCKED', 'COD_LIMIT', 'PAYMENT_METHOD_UNAVAILABLE', 'NOT_CONFIGURED'].some((k) => banner.text === c.err[k as keyof typeof c.err]) && <> <a className="font-semibold underline" href={wa(t.wa.greeting)} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}</p>
                </div>
              )}
              {dup && (
                <div role="alert" className="rounded-lg border border-gold/50 bg-gold/10 p-4 text-sm text-charcoal">
                  <p className="font-semibold">{c.dupTitle}</p>
                  <p className="mt-1">{c.dupText.replace('{orderNo}', dup.orderNo)}</p>
                  <Button type="button" className="mt-3" variant="outline" disabled={busy} onClick={handleSubmit((v) => place(v, true))}>{c.dupConfirm}</Button>
                </div>
              )}

              <section aria-labelledby="h-contact" className="space-y-4 rounded-xl2 bg-white p-5 shadow-card sm:p-6">
                <h2 id="h-contact" className="text-xl font-bold">{c.contact}</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={c.name} error={errors.name?.message}><Input autoComplete="name" aria-invalid={!!errors.name} {...register('name')} /></Field>
                  <Field label={c.phone} hint={c.phoneHint} error={errors.phone?.message}><Input type="tel" inputMode="tel" autoComplete="tel" placeholder="01XXXXXXXXX" aria-invalid={!!errors.phone} {...register('phone')} /></Field>
                  <Field label={c.email} hint={c.emailHint} error={errors.email?.message} className="sm:col-span-2"><Input type="email" inputMode="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} /></Field>
                </div>
              </section>

              <section aria-labelledby="h-delivery" className="space-y-4 rounded-xl2 bg-white p-5 shadow-card sm:p-6">
                <h2 id="h-delivery" className="text-xl font-bold">{c.delivery}</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={c.district} error={errors.district?.message}>
                    <Select autoComplete="address-level1" aria-invalid={!!errors.district} {...register('district')}>
                      <option value="">{c.districtPick}</option>
                      {(delivery?.districts ?? []).map((d) => <option key={d} value={d}>{d}</option>)}
                    </Select>
                  </Field>
                  <Field label={c.city} hint={c.cityHint} error={errors.city?.message}><Input autoComplete="address-level2" aria-invalid={!!errors.city} {...register('city')} /></Field>
                  <Field label={c.address} hint={c.addressHint} error={errors.address?.message} className="sm:col-span-2"><Textarea autoComplete="street-address" aria-invalid={!!errors.address} {...register('address')} /></Field>
                  <Field label={c.instructions} hint={c.instructionsHint} error={errors.instructions?.message} className="sm:col-span-2"><Input aria-invalid={!!errors.instructions} {...register('instructions')} /></Field>
                </div>
              </section>

              <section aria-labelledby="h-pay" className="space-y-3 rounded-xl2 bg-white p-5 shadow-card sm:p-6">
                <h2 id="h-pay" className="text-xl font-bold">{c.payment}</h2>
                {delivery && methods.length === 0 && <p role="alert" className="rounded-lg bg-gold/15 p-3 text-sm text-charcoal">{pay.noMethods}</p>}
                <div role="radiogroup" aria-labelledby="h-pay" className="space-y-3">
                  {methods.map((m) => {
                    const on = m === method;
                    const Icon = m === 'cod' ? Wallet : m === 'manual_bank' ? Landmark : Smartphone;
                    const label = m === 'cod' ? c.cod : m === 'manual_bank' ? pay.bankTitle : pay.manualTitle[m.replace('manual_', '') as 'bkash' | 'nagad' | 'rocket'];
                    const text = m === 'cod' ? c.codText : m === 'manual_bank' ? pay.bankText : pay.manualText;
                    return (
                      <label key={m} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4', on ? 'border-forest bg-sage-light/40' : 'border-sage/60 hover:border-forest/50')}>
                        <input type="radio" name="payment" value={m} checked={on} onChange={() => setChosen(m)} className="mt-1 h-4 w-4 accent-forest" />
                        <span><span className="flex items-center gap-2 font-semibold text-forest"><Icon aria-hidden className="h-4 w-4" />{label}</span><span className="mt-0.5 block text-sm text-charcoal-soft">{text}</span></span>
                      </label>
                    );
                  })}
                </div>
                {method === 'manual_bank' && delivery?.methods.bank && <PaymentDetails channelName={pay.bankTitle} bank={delivery.methods.bank} instructions={delivery.methods.bank.instructions} />}
                {method?.startsWith('manual_') && method !== 'manual_bank' && (() => {
                  const ch = delivery?.methods.manual.find((x) => `manual_${x.channel}` === method);
                  return ch ? <PaymentDetails channelName={pay.names[method] ?? ''} number={ch.number} instructions={ch.instructions} /> : null;
                })()}
              </section>
            </div>

            <aside aria-labelledby="h-summary" className="space-y-4 rounded-xl2 bg-white p-5 shadow-card sm:p-6 lg:sticky lg:top-6">
              <h2 id="h-summary" className="text-xl font-bold">{c.summary}</h2>
              <ul className="divide-y divide-sage/40">
                {(quote?.lines ?? []).map((l) => (
                  <li key={`${l.productId}-${l.sku}`} className={cn('flex gap-3 py-3', l.unavailable && 'opacity-70')}>
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-cream-dark">{l.image && <ProductImage src={l.image} alt="" className="object-contain" targetWidth={160} />}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug">{pName(l, lang)}</p>
                      {(l.issue === 'STOCK_REDUCED' || adjusted.some((a) => a.productId === l.productId && a.sku === l.sku)) && !l.unavailable && <p role="status" className="text-xs font-medium text-gold-dark">{c.warn.STOCK_REDUCED.replace('{qty}', formatNumber(l.qty, lang))}</p>}
                      {l.unavailable && <p className="text-xs font-semibold text-danger">{c.warn.ITEM_UNAVAILABLE}</p>}
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        {l.unavailable ? <span /> : (
                          <div role="group" aria-label={c.qty} className="inline-flex items-center rounded-full border border-forest/30">
                            <button type="button" aria-label={t.cart.dec} disabled={l.qty <= 1} onClick={() => setQty(l.productId, l.sku, l.qty - 1)} className="flex h-9 w-9 items-center justify-center text-forest disabled:opacity-40"><Minus aria-hidden className="h-3.5 w-3.5" /></button>
                            <span className="w-6 text-center text-sm font-semibold">{formatNumber(l.qty, lang)}</span>
                            <button type="button" aria-label={t.cart.inc} disabled={l.qty >= l.maxQty} onClick={() => setQty(l.productId, l.sku, l.qty + 1)} className="flex h-9 w-9 items-center justify-center text-forest disabled:opacity-40"><Plus aria-hidden className="h-3.5 w-3.5" /></button>
                          </div>
                        )}
                        <span className="text-sm font-semibold">{l.unavailable ? '—' : money(l.lineTotal)}</span>
                        <button type="button" aria-label={`${t.cart.remove}: ${pName(l, lang)}`} onClick={() => remove(l.productId, l.sku)} className="flex h-9 w-9 items-center justify-center rounded-full text-danger hover:bg-danger/10"><Trash2 aria-hidden className="h-4 w-4" /></button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <CouponBox code={couponCode} quote={quote} loading={loading} onApply={setCoupon} onRemove={() => setCoupon(null)} />

              <dl className={cn('space-y-1.5 text-sm transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
                <div className="flex justify-between"><dt>{c.subtotal}</dt><dd>{quote ? money(quote.subtotal) : '—'}</dd></div>
                {quote && quote.productDiscount > 0 && <div className="flex justify-between text-forest"><dt>{c.productDiscount}</dt><dd>−{money(quote.productDiscount)}</dd></div>}
                {quote && quote.couponDiscount > 0 && <div className="flex justify-between text-forest"><dt>{c.couponDiscount}</dt><dd>−{money(quote.couponDiscount)}</dd></div>}
                <div className="flex justify-between"><dt className="flex items-center gap-1.5"><Truck aria-hidden className="h-4 w-4" />{c.deliveryFee}{quote?.zone && <span className="text-xs text-charcoal-soft">({quote.zone.name})</span>}</dt><dd className={cn(quote?.deliveryFee === 0 && 'font-semibold text-forest')}>{quote ? (quote.deliveryFee === 0 ? c.free : money(quote.deliveryFee)) : '—'}</dd></div>
                <div className="flex justify-between border-t border-sage/40 pt-2 text-lg font-bold"><dt>{c.total}</dt><dd>{quote ? money(quote.total) : '—'}</dd></div>
              </dl>
              {loading && <p role="status" className="text-xs text-charcoal-soft">{c.updating}</p>}
              {hasUnavailable && <p role="alert" className="text-sm font-medium text-danger">{c.fixCart}</p>}

              <Button type="submit" size="lg" full className={inline ? undefined : 'hidden lg:inline-flex'} disabled={!canSubmit}>{busy || isSubmitting ? c.placing : priceChanged ? c.priceChangedBtn : inline && quote ? c.placeWithTotal.replace('{total}', money(quote.total)) : c.place}</Button>
            </aside>

            {!inline && <div className="fixed inset-x-0 bottom-0 z-30 border-t border-sage/50 bg-cream/95 px-4 py-2.5 shadow-[0_-6px_20px_rgba(35,75,53,0.12)] backdrop-blur lg:hidden" style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}>
              <Button type="submit" size="lg" full disabled={!canSubmit}>{busy || isSubmitting ? c.placing : quote ? c.placeWithTotal.replace('{total}', money(quote.total)) : c.place}</Button>
            </div>}
          </form>
  );
}
