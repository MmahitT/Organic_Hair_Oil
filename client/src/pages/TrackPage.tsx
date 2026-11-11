import { CheckCircle2, Circle, FileText, MessageCircle, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckoutHeader } from '@/components/shop/CheckoutHeader';
import { ReviewForm } from '@/components/shop/ReviewForm';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Form';
import { useShop } from '@/hooks/useShop';
import { useOrdersT, useT } from '@/hooks/useT';
import { COUNTS_AS_PURCHASE, firstTimePurchase, track } from '@/lib/analytics';
import { ApiError, apiFetch } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { normalizeBdPhone } from '@/lib/phone';
import type { TrackData } from '@/types/api';

const API = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
const FLOW = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'];

/** Request form used for both "cancel" and "return". */
function RequestBox({ kind, data, phone, onDone }: { kind: 'cancel' | 'ret'; data: TrackData; phone: string; onDone: () => void }) {
  const o = useOrdersT().track;
  const c = o[kind];
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (reason.trim().length < 3) return setErr(c.reason);
    setBusy(true); setErr(null);
    try {
      await apiFetch(`/orders/${data.orderNo}/${kind === 'cancel' ? 'cancel-request' : 'return-request'}`, { method: 'POST', body: { phone, reason: reason.trim() } });
      onDone();
    } catch (e) { setErr(e instanceof ApiError && e.status !== 0 && e.status < 500 && e.code !== 'VALIDATION_ERROR' ? e.message : c.error); } finally { setBusy(false); }
  };
  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}>{c.button}</Button>;
  return (
    <div className="space-y-3 rounded-lg border border-sage/60 p-4">
      <p className="font-semibold">{c.title}</p>
      <Field label={c.reason} hint={kind === 'cancel' ? o.cancel.reasonHint : undefined}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      <Button onClick={() => void send()} disabled={busy}>{busy ? o.cancel.sending : c.send}</Button>
    </div>
  );
}

export default function TrackPage() {
  const o = useOrdersT().track;
  const { lang, money } = useT();
  const { wa, hasWhatsapp } = useShop();
  const [sp] = useSearchParams();
  const [orderNo, setOrderNo] = useState((sp.get('order') ?? '').toUpperCase());
  const [phone, setPhone] = useState('');
  const [errs, setErrs] = useState<{ orderNo?: string; phone?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<TrackData | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [data?.orderNo]);
  useEffect(() => {
    if (data && COUNTS_AS_PURCHASE.includes(data.status) && firstTimePurchase(data.orderNo)) {
      track('purchase', { transaction_id: data.orderNo, value: data.total, items: data.items.map((i) => ({ item_id: i.productId, item_name: i.name, price: i.unitPrice, quantity: i.quantity })) });
    }
  }, [data]);

  const lookup = async (quiet = false) => {
    const e: typeof errs = {};
    if (!/^HO-\d{6}-[A-Z0-9]{4,6}$/.test(orderNo.trim().toUpperCase())) e.orderNo = o.notFound;
    const p = normalizeBdPhone(phone);
    if (!p) e.phone = o.phone;
    setErrs(e);
    if (e.orderNo || e.phone || !p) return;
    if (!quiet) setBusy(true);
    try {
      const r = await apiFetch<TrackData>('/orders/track', { method: 'POST', body: { orderNo: orderNo.trim().toUpperCase(), phone: p } });
      setData(r.data);
    } catch (x) {
      setData(null);
      setErrs({ form: x instanceof ApiError ? (x.status === 429 ? o.rateLimited : x.status === 0 ? o.network : o.notFound) : o.network });
    } finally { setBusy(false); }
  };
  const afterAction = (msg: string) => { setNote(msg); void lookup(true); };
  const phoneNorm = normalizeBdPhone(phone) ?? '';
  const waLink = data && hasWhatsapp ? wa(o.waMessage.replace('{orderNo}', data.orderNo)) : null;

  const steps = data && (data.status === 'cancelled' || data.status === 'returned') ? [...data.timeline.map((t) => t.status)] : FLOW;

  return (
    <>
      <Helmet><title>{o.title} — Beauty Organic Hair Oil</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <CheckoutHeader title={o.title} />
      <main className="container-page max-w-2xl space-y-5 py-8 sm:py-12">
        {!data && (
          <section className="rounded-xl2 bg-white p-5 shadow-card sm:p-8" aria-labelledby="h-track">
            <h1 id="h-track" className="text-2xl font-bold sm:text-3xl">{o.heading}</h1>
            <p className="mt-1 text-charcoal-soft">{o.intro}</p>
            {/* An explicit submit handler keeps Enter working without any nested forms. */}
            <form className="mt-5 space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void lookup(); }}>
              <Field label={o.orderNo} hint={o.orderNoHint} error={errs.orderNo}><Input value={orderNo} onChange={(e) => setOrderNo(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" aria-invalid={!!errs.orderNo} /></Field>
              <Field label={o.phone} hint={o.phoneHint} error={errs.phone}><Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" aria-invalid={!!errs.phone} /></Field>
              {errs.form && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{errs.form}</p>}
              <Button type="submit" size="lg" full disabled={busy}>{busy ? o.finding : o.find}</Button>
            </form>
          </section>
        )}

        {data && (
          <>
            <section className="rounded-xl2 bg-white p-5 shadow-card sm:p-6" aria-labelledby="h-status">
              <p className="text-sm text-charcoal-soft">{o.orderNo}</p>
              <h1 id="h-status" className="font-mono text-2xl font-bold tracking-wide text-forest">{data.orderNo}</h1>
              <p className="mt-3 inline-block rounded-full bg-sage-light px-4 py-1.5 text-sm font-semibold text-forest" data-testid="track-status">{o.statuses[data.status] ?? data.status}</p>
              {note && <p role="status" className="mt-3 rounded-lg bg-gold/15 p-3 text-sm">{note}</p>}
              <ol className="mt-5 space-y-3" aria-label={o.timeline}>
                {steps.map((s) => {
                  const hit = data.timeline.find((t) => t.status === s);
                  return (
                    <li key={s} className="flex items-start gap-3">
                      {hit ? <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-forest" /> : <Circle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-sage" />}
                      <span className={hit ? 'font-semibold' : 'text-charcoal-soft'}>{o.statuses[s] ?? s}{hit && <span className="block text-xs font-normal text-charcoal-soft">{new Date(hit.at).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB')}</span>}</span>
                    </li>
                  );
                })}
              </ol>
              {data.courier && <p className="mt-4 flex items-center gap-2 rounded-lg bg-cream p-3 text-sm"><Truck aria-hidden className="h-4 w-4 text-forest" />{data.courier.name && <span>{o.courier}: <strong>{data.courier.name}</strong></span>}{data.courier.trackingNo && <span>· {o.trackingNo}: <strong className="font-mono">{data.courier.trackingNo}</strong></span>}</p>}
            </section>

            <section className="rounded-xl2 bg-white p-5 shadow-card sm:p-6">
              <h2 className="mb-2 text-lg font-bold">{o.items}</h2>
              <ul className="divide-y divide-sage/40">
                {data.items.map((i) => <li key={i.productId} className="flex justify-between gap-3 py-2 text-sm"><span>{i.name} <span className="text-charcoal-soft">× {formatNumber(i.quantity, lang)}</span></span><span className="font-semibold">{money(i.lineTotal)}</span></li>)}
              </ul>
              <p className="mt-3 flex justify-between border-t border-sage/40 pt-3 text-lg font-bold"><span>{o.total}</span><span>{money(data.total)}</span></p>
              <p className="mt-2 text-sm text-charcoal-soft">{o.deliverTo}: {data.customer.firstName} · {data.customer.district}{data.deliveryZone ? ` (${data.deliveryZone})` : ''}</p>
              <a href={`${API}/orders/${data.orderNo}/invoice?token=${encodeURIComponent(data.token)}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-forest hover:underline"><FileText aria-hidden className="h-4 w-4" />{o.invoice}</a>
            </section>

            {(data.canCancel || data.cancellationRequested || data.canReturn || data.returnStatus) && (
              <section className="space-y-3 rounded-xl2 bg-white p-5 shadow-card sm:p-6">
                {data.cancellationRequested && <p role="status" className="text-sm">{o.cancel.pending}</p>}
                {data.canCancel && <RequestBox kind="cancel" data={data} phone={phoneNorm} onDone={() => afterAction(o.cancel.done)} />}
                {data.returnStatus && <p role="status" className="text-sm">{({ requested: o.ret.requested, approved: o.ret.approved, rejected: o.ret.rejected, completed: o.ret.completed } as Record<string, string>)[data.returnStatus]}</p>}
                {data.canReturn && <RequestBox kind="ret" data={data} phone={phoneNorm} onDone={() => afterAction(o.ret.done)} />}
              </section>
            )}

            {data.status === 'delivered' && (
              <section className="space-y-3 rounded-xl2 bg-white p-5 shadow-card sm:p-6" aria-labelledby="h-review">
                <h2 id="h-review" className="text-lg font-bold">{o.review.title}</h2>
                <p className="text-sm text-charcoal-soft">{o.review.intro}</p>
                {data.items.map((i) => <ReviewForm key={i.productId} orderNo={data.orderNo} phone={phoneNorm} productId={i.productId} name={i.name} />)}
              </section>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              {waLink && <ButtonLink size="lg" href={waLink} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden className="h-5 w-5" />{o.whatsapp}</ButtonLink>}
              <Button size="lg" variant="outline" onClick={() => { setData(null); setNote(null); }}>{o.another}</Button>
              <Link to="/" className="inline-flex min-h-12 items-center justify-center rounded-full px-5 text-base font-semibold text-forest hover:underline">←</Link>
            </div>
          </>
        )}
      </main>
    </>
  );
}
