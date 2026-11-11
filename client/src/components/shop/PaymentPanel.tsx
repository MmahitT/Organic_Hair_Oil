import { AlertTriangle, CheckCircle2, Clock, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { useCheckoutT, usePayT, useT } from '@/hooks/useT';
import { ApiError, apiFetch } from '@/lib/api';
import { normalizeBdPhone } from '@/lib/phone';
import type { OrderStatusData } from '@/types/api';

interface Props { order: OrderStatusData; token: string; onChanged: () => void }
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? '');

/** Payment state for an order. The status always comes from the API; only the owner's verification marks an order paid. */
export function PaymentPanel({ order, token, onChanged }: Props) {
  const p = usePayT().panel;
  const { payment } = order;

  if (payment.method === 'cod') return null;

  if (payment.status === 'refunded' || payment.status === 'partially_refunded' || payment.status === 'refund_pending') {
    return <div role="status" className="rounded-xl2 border border-gold/50 bg-gold/10 p-5 text-sm text-charcoal shadow-card sm:p-6"><strong>{payment.status === 'refunded' ? p.refundedTitle : ''}</strong> {payment.status === 'refunded' ? p.refundedText : payment.status === 'partially_refunded' ? p.partRefunded : p.refundDue}</div>;
  }
  if (payment.status === 'paid') {
    return (
      <div role="status" className="rounded-xl2 bg-sage-light p-5 shadow-card sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-forest"><CheckCircle2 aria-hidden className="h-5 w-5" />{p.paidTitle}</h2>
        <p className="mt-1 text-charcoal">{p.paidText}</p>
      </div>
    );
  }
  if (order.status === 'cancelled' || payment.status === 'expired') {
    return <div role="status" className="rounded-xl2 border border-gold/50 bg-gold/10 p-5 text-sm text-charcoal shadow-card sm:p-6">{p.released}</div>;
  }

  return payment.manual ? <ManualPay order={order} token={token} onChanged={onChanged} /> : null;
}

function ManualPay({ order, token, onChanged }: Props) {
  const p = usePayT().panel;
  const pay = usePayT();
  const { money } = useT();
  const c = useCheckoutT();
  const m = order.payment.manual!;
  const isBank = m.channel === 'bank';
  const channel = pay.names[`manual_${m.channel}`] ?? m.channel;
  const [trx, setTrx] = useState('');
  const [sender, setSender] = useState('');
  const [reference, setReference] = useState('');
  const [errs, setErrs] = useState<{ trx?: string; sender?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const rejected = order.payment.status === 'failed';

  if (m.submitted) {
    return <div role="status" className="rounded-xl2 border border-gold/50 bg-gold/10 p-5 text-sm text-charcoal shadow-card sm:p-6"><Clock aria-hidden className="mr-2 inline h-4 w-4" />{p.submitted}</div>;
  }

  const submit = async () => {
    const e: typeof errs = {};
    const t = trx.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9\-/]{4,29}$/.test(t)) e.trx = p.trxInvalid;
    const phone = isBank ? null : normalizeBdPhone(sender);
    if (!isBank && !phone) e.sender = p.senderInvalid;
    setErrs(e);
    if (e.trx || e.sender) return;
    setBusy(true);
    try {
      await apiFetch('/payments/manual/submit', { method: 'POST', body: { orderNo: order.orderNo, token, trxId: t, ...(phone ? { senderNumber: phone } : {}), ...(isBank && sender.trim() ? { senderName: sender.trim() } : {}), ...(reference.trim() ? { reference: reference.trim() } : {}) } });
      onChanged();
    } catch (x) {
      setErrs({ form: x instanceof ApiError && x.code === 'TRX_ALREADY_USED' ? p.dupTrx : p.genericErr });
    } finally { setBusy(false); }
  };
  const copyNumber = async () => { try { await navigator.clipboard.writeText((isBank ? m.bank?.accountNumber : m.number) ?? ''); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ } };
  const copyable = isBank ? m.bank?.accountNumber : m.number;

  // Not a <form>: the checkout flow forbids nested forms, and Enter handling is explicit here.
  return (
    <div className="space-y-4 rounded-xl2 bg-white p-5 shadow-card sm:p-6" onKeyDown={(ev) => { if (ev.key === 'Enter' && (ev.target as HTMLElement).tagName === 'INPUT') { ev.preventDefault(); void submit(); } }}>
      <h2 className="text-lg font-bold">{isBank ? p.bankHead : p.manualHead}</h2>
      {rejected && <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800"><AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />{p.rejected}</p>}
      <p className="text-charcoal-soft">{fill(isBank ? p.bankSend : p.manualSend, { amount: money(order.total), channel })}</p>
      {m.instructions && <p className="whitespace-pre-line rounded-lg bg-cream p-3 text-sm">{m.instructions}</p>}
      <div className="flex items-center justify-between gap-3 rounded-lg bg-sage-light/60 p-4">
        {isBank && m.bank ? (
          <dl className="space-y-0.5 text-sm" data-testid="merchant-bank">
            {([[pay.bankName, m.bank.bankName], [pay.accountName, m.bank.accountName], [pay.accountNumber, m.bank.accountNumber], [pay.branch, m.bank.branch]] as const).filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex gap-2"><dt className="text-charcoal-soft">{k}:</dt><dd className="font-mono font-semibold text-forest">{v}</dd></div>)}
          </dl>
        ) : (
          <div><p className="text-xs text-charcoal-soft">{p.manualNumber} · {channel}</p><p className="font-mono text-xl font-bold tracking-wide text-forest" data-testid="merchant-number">{m.number ?? '—'}</p></div>
        )}
        {copyable && <button type="button" onClick={() => void copyNumber()} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-forest/30 px-3 text-xs font-semibold text-forest hover:bg-white"><Copy aria-hidden className="h-3.5 w-3.5" />{copied ? c.order.copied : p.copyNumber}</button>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={p.trxLabel} hint={p.trxHint} error={errs.trx}><Input value={trx} onChange={(e) => setTrx(e.target.value)} autoCapitalize="characters" autoComplete="off" aria-invalid={!!errs.trx} /></Field>
        {isBank
          ? <Field label={p.senderNameLabel} hint={p.senderNameHint}><Input value={sender} onChange={(e) => setSender(e.target.value)} autoComplete="name" maxLength={60} /></Field>
          : <Field label={p.senderLabel} hint={fill(p.senderHint, { channel })} error={errs.sender}><Input value={sender} onChange={(e) => setSender(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" aria-invalid={!!errs.sender} /></Field>}
        <Field label={p.referenceLabel} hint={p.referenceHint} className="sm:col-span-2"><Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} autoComplete="off" /></Field>
      </div>
      <p className="text-xs text-charcoal-soft">{p.ownerNote}</p>
      {errs.form && <p role="alert" className="text-sm text-red-700">{errs.form}</p>}
      <Button onClick={() => void submit()} disabled={busy}>{busy ? p.submitting : p.submit}</Button>
    </div>
  );
}
