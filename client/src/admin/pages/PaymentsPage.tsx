import { Fragment, useCallback, useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { formatTaka } from '@/lib/format';
import { adminFetch, downloadFile } from '../auth';
import { Alert, Badge, Btn, Card, Field, Input, Pager, Select, Textarea } from '../ui';

interface PaymentRow {
  _id: string; provider: 'manual' | 'cod'; method?: string; tranId: string; amount: number; refundedTotal?: number; status: string; note?: string; createdAt: string;
  manual?: { trxId?: string; senderNumber?: string; senderName?: string; reference?: string; submittedAt?: string };
  events: { type: string; at: string; by?: string; note?: string }[];
  refunds?: { amount: number; reason?: string; at: string }[];
  order: { _id: string; orderNo: string; customer?: { name: string; phone: string } } | null;
}
interface PaySettings {
  codEnabled: boolean;
  manual: { enabled: boolean; bkash: string; nagad: string; rocket: string; instructions: { bkash: string; nagad: string; rocket: string } };
  bank: { enabled: boolean; bankName: string; accountName: string; accountNumber: string; branch: string; instructions: string };
}

/** Plain-language status. "Verified" = an admin (or the gateway) confirmed the money really arrived. */
const STATUS: Record<string, string> = {
  pending: 'Pending', initiated: 'Awaiting payment', paid: 'Verified', failed: 'Failed', cancelled: 'Cancelled', expired: 'Expired',
  refund_pending: 'Refund due', refunded: 'Refunded', partially_refunded: 'Partly refunded', cod_pending: 'COD — to collect', cod_collected: 'COD — collected',
};
const tone: Record<string, string> = { paid: 'published', cod_collected: 'published', initiated: 'draft', pending: 'hidden', cod_pending: 'draft', failed: 'out_of_stock', cancelled: 'draft', expired: 'draft', refund_pending: 'out_of_stock', refunded: 'draft', partially_refunded: 'hidden' };
const words = (s: string) => s.replace(/_/g, ' ');
const needsDecision = (p: PaymentRow) => p.provider === 'manual' && p.status === 'pending';
const refundable = (p: PaymentRow) => ['paid', 'cod_collected', 'partially_refunded', 'refund_pending'].includes(p.status);
const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const typeName = (p: PaymentRow) => (p.provider === 'cod' ? 'COD' : p.method === 'bank' ? 'Bank transfer' : `${p.method ?? 'Mobile money'}`);

function SettingsCard() {
  const [s, setS] = useState<PaySettings | null>(null);
  const [mf, setMf] = useState<PaySettings['manual'] | null>(null);
  const [bf, setBf] = useState<PaySettings['bank'] | null>(null);
  const [note, setNote] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = (d: PaySettings) => { setS(d); setMf(d.manual); setBf(d.bank); };
  const load = useCallback(async () => {
    try { apply((await adminFetch<PaySettings>('/admin/settings/payments')).data); } catch (e) { setNote({ tone: 'error', text: msg(e, 'Could not load payment settings') }); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async (body: object, ok: string) => {
    setBusy(true); setNote(null);
    try { apply((await adminFetch<PaySettings>('/admin/settings/payments', { method: 'PATCH', body })).data); setNote({ tone: 'success', text: ok }); } catch (e) { setNote({ tone: 'error', text: msg(e, 'Could not save') }); void load(); } finally { setBusy(false); }
  };
  if (!s || !mf || !bf) return <Card title="Payment methods">{note ? <Alert>{note.text}</Alert> : <p role="status" className="text-charcoal-soft">Loading…</p>}</Card>;

  return (
    <Card title="Payment methods">
      <div className="space-y-5">
        <p className="text-sm text-charcoal-soft">Everything customers see at checkout — account numbers and instructions — is set here. Details are stored in your database, not in the website code.</p>
        {note && <Alert tone={note.tone}>{note.text}</Alert>}

        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-forest" checked={s.codEnabled} disabled={busy} onChange={(e) => void save({ codEnabled: e.target.checked }, 'Saved')} /><span className="font-semibold">Cash on Delivery</span></label>

        <div className="rounded-lg border border-sage/60 p-4">
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-forest" checked={mf.enabled} disabled={busy} onChange={(e) => void save({ manual: { enabled: e.target.checked } }, 'Saved')} /><span><span className="font-semibold">Manual bKash / Nagad / Rocket (send money)</span><span className="block text-xs text-charcoal-soft">Customers send money to your number and enter the TrxID. You check your own bKash/Nagad/Rocket account, then verify below.</span></span></label>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            {(['bkash', 'nagad', 'rocket'] as const).map((k) => (
              <div key={k} className="space-y-2">
                <Field label={`${k[0]!.toUpperCase()}${k.slice(1)} number`}><Input inputMode="tel" autoComplete="off" value={mf[k]} onChange={(e) => setMf({ ...mf, [k]: e.target.value })} placeholder="01XXXXXXXXX" /></Field>
                <Field label="Instructions (optional)"><Textarea rows={2} maxLength={500} value={mf.instructions[k]} onChange={(e) => setMf({ ...mf, instructions: { ...mf.instructions, [k]: e.target.value } })} placeholder={k === 'bkash' ? 'e.g. Use “Send Money”, not “Cash Out”.' : ''} /></Field>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-charcoal-soft">Only channels with a number are offered.</p>
          <Btn className="mt-3" disabled={busy} onClick={() => void save({ manual: { bkash: mf.bkash, nagad: mf.nagad, rocket: mf.rocket, instructions: mf.instructions } }, 'Saved')}>Save mobile-money details</Btn>
        </div>

        <div className="rounded-lg border border-sage/60 p-4">
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-forest" checked={bf.enabled} disabled={busy} onChange={(e) => void save({ bank: { enabled: e.target.checked } }, 'Saved')} /><span><span className="font-semibold">Bank transfer</span><span className="block text-xs text-charcoal-soft">Needs the bank name, account name and account number before it can be switched on.</span></span></label>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Bank name"><Input value={bf.bankName} maxLength={80} onChange={(e) => setBf({ ...bf, bankName: e.target.value })} /></Field>
            <Field label="Account name"><Input value={bf.accountName} maxLength={80} onChange={(e) => setBf({ ...bf, accountName: e.target.value })} /></Field>
            <Field label="Account number"><Input value={bf.accountNumber} maxLength={40} inputMode="text" autoComplete="off" onChange={(e) => setBf({ ...bf, accountNumber: e.target.value })} /></Field>
            <Field label="Branch (optional)"><Input value={bf.branch} maxLength={80} onChange={(e) => setBf({ ...bf, branch: e.target.value })} /></Field>
            <Field label="Instructions (optional)" className="sm:col-span-2"><Textarea rows={2} maxLength={500} value={bf.instructions} onChange={(e) => setBf({ ...bf, instructions: e.target.value })} placeholder="e.g. Please write your order number as the transfer reference." /></Field>
          </div>
          <Btn className="mt-3" disabled={busy} onClick={() => void save({ bank: { bankName: bf.bankName, accountName: bf.accountName, accountNumber: bf.accountNumber, branch: bf.branch, instructions: bf.instructions } }, 'Saved')}>Save bank details</Btn>
        </div>

      </div>
    </Card>
  );
}

type Decision = { row: PaymentRow; kind: 'approve' | 'reject' | 'refund' };

export default function PaymentsPage() {
  const [status, setStatus] = useState('');
  const [provider, setProvider] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [noteText, setNoteText] = useState('');
  const [amount, setAmount] = useState('');
  const [flash, setFlash] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const limit = 20;

  // Only the newest request may update the screen: a slow earlier response must never overwrite a newer filter's results.
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    setError(null);
    try {
      const r = await adminFetch<{ items: PaymentRow[] }>('/admin/payments', { query: { page, limit, status, provider, q } });
      if (mine !== seq.current) return;
      setRows(r.data.items); setTotal(r.meta?.total ?? 0);
    } catch (e) { if (mine === seq.current) setError(msg(e, 'Failed to load payments')); }
  }, [page, status, provider, q]);
  useEffect(() => { void load(); }, [load]);

  const start = (row: PaymentRow, kind: Decision['kind']) => { setDecision({ row, kind }); setNoteText(''); setAmount(kind === 'refund' ? String(row.amount - (row.refundedTotal ?? 0)) : ''); };
  const confirm = async () => {
    if (!decision) return;
    const { row, kind } = decision;
    setBusy(row._id); setFlash(null);
    try {
      if (kind === 'refund') {
        await adminFetch(`/admin/payments/${row._id}/refund`, { method: 'POST', body: { reason: noteText.trim(), ...(amount ? { amount: Number(amount) } : {}) } });
        setFlash({ tone: 'success', text: 'Refund recorded.' });
      } else {
        await adminFetch(`/admin/payments/${row._id}/resolve`, { method: 'POST', body: { approve: kind === 'approve', note: noteText } });
        setFlash({ tone: 'success', text: kind === 'approve' ? 'Payment verified — the order is now marked paid.' : 'Payment rejected.' });
      }
      setDecision(null); setNoteText(''); await load();
    } catch (e) { setFlash({ tone: 'error', text: msg(e, 'Could not save the decision') }); } finally { setBusy(null); }
  };
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div><h1 className="text-3xl font-bold">Payments</h1><p className="text-sm text-charcoal-soft">A payment is only <strong>Verified</strong> after you have checked the money in your own bKash / bank account and approved it here. A customer’s transaction ID or screenshot never marks an order paid by itself.</p></div>
      <SettingsCard />
      <Card title="Payment history" actions={<Btn tone="secondary" className="min-h-9 px-3" onClick={() => void downloadFile('/admin/payments/export', 'payments.csv').catch((e) => setFlash({ tone: 'error', text: msg(e, 'Export failed') }))}>Export CSV</Btn>}>
        {flash && <div className="mb-3"><Alert tone={flash.tone}>{flash.text}</Alert></div>}
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Input aria-label="Search payments" placeholder="Order no. or transaction ID" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <Select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>{['pending', 'paid', 'failed', 'refund_pending', 'partially_refunded', 'refunded', 'initiated', 'cancelled', 'expired', 'cod_pending', 'cod_collected'].map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}
          </Select>
          <Select aria-label="Filter by type" value={provider} onChange={(e) => { setProvider(e.target.value); setPage(1); }}>
            <option value="">All types</option><option value="cod">Cash on Delivery</option><option value="manual">Prepaid — bKash / bank (manual)</option>
          </Select>
        </div>
        {decision && (
          <div className="mb-4 space-y-3 rounded-lg border border-gold/50 bg-gold/10 p-4">
            <p className="font-semibold">{{ approve: 'Verify', reject: 'Reject', refund: 'Record a refund for' }[decision.kind]} {decision.row.order?.orderNo} ({formatTaka(decision.row.amount, 'en')})?</p>
            {decision.kind === 'approve' && <p className="text-sm text-charcoal-soft">Verify only after you have seen this exact amount in your {decision.row.method === 'bank' ? 'bank statement' : `${decision.row.method ?? 'mobile-money'} account`}{decision.row.manual?.trxId ? <> and the transaction ID matches <strong className="font-mono">{decision.row.manual.trxId}</strong></> : null}. The order will be marked paid.</p>}
            {decision.kind === 'reject' && <p className="text-sm text-charcoal-soft">The customer will be asked to check the transaction ID and submit again.</p>}
            {decision.kind === 'refund' && <p className="text-sm text-charcoal-soft">This only <strong>records</strong> a refund you have already sent back to the customer (bKash, bank or cash). It does not send any money.</p>}
            {decision.kind === 'refund' && <Field label={`Amount refunded (৳, up to ${decision.row.amount - (decision.row.refundedTotal ?? 0)})`}><Input className="w-40" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} /></Field>}
            <Field label={decision.kind === 'refund' ? 'Reason (required)' : 'Note (optional)'}><Textarea rows={2} value={noteText} onChange={(e) => setNoteText(e.target.value)} maxLength={300} /></Field>
            <div className="flex gap-2"><Btn tone={decision.kind === 'reject' ? 'danger' : 'primary'} disabled={busy !== null || (decision.kind === 'refund' && noteText.trim().length < 3)} onClick={() => void confirm()}>{{ approve: 'Yes, verify', reject: 'Yes, reject', refund: 'Record refund' }[decision.kind]}</Btn><Btn tone="secondary" onClick={() => setDecision(null)}>Cancel</Btn></div>
          </div>
        )}
        {error && <Alert>{error} <button className="font-semibold underline" onClick={() => void load()}>Retry</button></Alert>}
        {!error && rows === null && <p role="status" className="py-8 text-center text-charcoal-soft">Loading…</p>}
        {rows && rows.length === 0 && <p className="py-8 text-center text-charcoal-soft">No payments found.</p>}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead><tr className="border-b border-sage/50 text-xs uppercase tracking-wide text-charcoal-soft"><th className="py-2 pr-3">Order</th><th className="px-3">Type</th><th className="px-3">Amount</th><th className="px-3">Status</th><th className="px-3">Customer’s details</th><th className="px-3 text-right">Actions</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <Fragment key={p._id}>
                    <tr className="border-b border-sage/30 align-top">
                      <td className="py-3 pr-3">{p.order ? <Link to={`/admin/orders/${p.order._id}`} className="font-mono font-semibold text-forest hover:underline">{p.order.orderNo}</Link> : '—'}<span className="block text-xs text-charcoal-soft">{p.order?.customer?.name} · {new Date(p.createdAt).toLocaleString()}</span></td>
                      <td className="px-3">{typeName(p)}</td>
                      <td className="px-3 font-semibold">{formatTaka(p.amount, 'en')}{(p.refundedTotal ?? 0) > 0 && <span className="block text-xs font-normal text-charcoal-soft">refunded {formatTaka(p.refundedTotal ?? 0, 'en')}</span>}</td>
                      <td className="px-3"><Badge kind={tone[p.status] ?? 'draft'}>{STATUS[p.status] ?? words(p.status)}</Badge>{p.note && <span className="mt-1 block max-w-[200px] text-xs text-charcoal-soft">{p.note}</span>}</td>
                      <td className="px-3 font-mono text-xs">{p.provider === 'manual' ? <>{p.manual?.trxId ?? '—'}{(p.manual?.senderNumber || p.manual?.senderName) && <span className="block text-charcoal-soft">from {p.manual?.senderNumber ?? p.manual?.senderName}</span>}{p.manual?.reference && <span className="block font-sans text-charcoal-soft">{p.manual.reference}</span>}</> : p.provider === 'cod' ? '—' : p.tranId}</td>
                      <td className="space-y-1 px-3 text-right">
                        {needsDecision(p) && <><Btn className="min-h-9 px-3" onClick={() => start(p, 'approve')}>Verify</Btn> <Btn tone="secondary" className="min-h-9 px-3" onClick={() => start(p, 'reject')}>Reject</Btn></>}
                        {refundable(p) && <Btn tone="secondary" className="min-h-9 px-3" onClick={() => start(p, 'refund')}>Record refund</Btn>}
                                                <Btn tone="ghost" className="min-h-9 px-3" onClick={() => setOpen(open === p._id ? null : p._id)}>{open === p._id ? 'Hide history' : 'History'}</Btn>
                      </td>
                    </tr>
                    {open === p._id && (
                      <tr className="border-b border-sage/30 bg-cream/50"><td colSpan={6} className="px-3 py-3"><ul className="space-y-1 text-xs text-charcoal-soft">{p.events.map((ev, i) => <li key={i}><span className="font-mono">{new Date(ev.at).toLocaleString()}</span> — {ev.type.replace(/[:_]/g, ' ')}{ev.by ? ` · by ${ev.by}` : ''}{ev.note ? ` · “${ev.note}”` : ''}</li>)}</ul></td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} limit={limit} total={total} onPage={setPage} />
      </Card>
    </div>
  );
}
