import { useState } from 'react';
import { formatTaka } from '@/lib/format';
import { adminFetch } from '../auth';
import { errMsg, useLoad } from '../hooks';
import { Alert, Badge, Btn, Card, Field, Input, Select } from '../ui';

interface Coupon {
  _id: string; code: string; type: 'percent' | 'fixed' | 'free_delivery'; value: number; maxDiscount?: number | null; minOrderValue?: number; startsAt?: string | null; expiresAt?: string | null;
  usageLimit?: number | null; usedCount: number; perCustomerLimit?: number | null; isActive: boolean;
}
interface Usage { _id: string; phone?: string; createdAt: string; order?: string }
interface Form { code: string; type: Coupon['type']; value: string; maxDiscount: string; minOrderValue: string; startsAt: string; expiresAt: string; usageLimit: string; perCustomerLimit: string }
const EMPTY: Form = { code: '', type: 'percent', value: '', maxDiscount: '', minOrderValue: '', startsAt: '', expiresAt: '', usageLimit: '', perCustomerLimit: '' };
const day = (d?: string | null) => (d ? new Date(new Date(d).getTime() + 6 * 3600_000).toISOString().slice(0, 10) : '');
const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
const describe = (c: Coupon) => (c.type === 'percent' ? `${c.value}% off${c.maxDiscount ? ` (max ${formatTaka(c.maxDiscount, 'en')})` : ''}` : c.type === 'fixed' ? `${formatTaka(c.value, 'en')} off` : 'Free delivery');

function state(c: Coupon): { label: string; kind: string } {
  const now = Date.now();
  if (!c.isActive) return { label: 'Off', kind: 'draft' };
  if (c.expiresAt && new Date(c.expiresAt).getTime() < now) return { label: 'Expired', kind: 'out_of_stock' };
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return { label: 'Scheduled', kind: 'hidden' };
  if (c.usageLimit != null && c.usedCount >= c.usageLimit) return { label: 'Used up', kind: 'out_of_stock' };
  return { label: 'Active', kind: 'published' };
}

export default function CouponsPage() {
  const { data, error, reload } = useLoad(async () => (await adminFetch<{ items: Coupon[] }>('/admin/coupons')).data.items, 'coupons');
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [errs, setErrs] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<{ code: string; rows: Usage[] } | null>(null);

  const open = (c?: Coupon) => {
    setEditing(c?._id ?? null); setErrs(null);
    setForm(c ? { code: c.code, type: c.type, value: String(c.value), maxDiscount: c.maxDiscount ? String(c.maxDiscount) : '', minOrderValue: c.minOrderValue ? String(c.minOrderValue) : '', startsAt: day(c.startsAt), expiresAt: day(c.expiresAt), usageLimit: c.usageLimit ? String(c.usageLimit) : '', perCustomerLimit: c.perCustomerLimit ? String(c.perCustomerLimit) : '' } : EMPTY);
  };
  const save = async () => {
    if (!form) return;
    if (!editing && !/^[A-Za-z0-9_-]{3,30}$/.test(form.code.trim())) return setErrs('Code: 3–30 letters, digits, - or _ (no spaces).');
    if (form.type !== 'free_delivery' && !(Number(form.value) > 0)) return setErrs('Enter the discount value.');
    if (form.type === 'percent' && Number(form.value) > 100) return setErrs('A percentage cannot be more than 100.');
    const body = {
      ...(editing ? {} : { code: form.code.trim().toUpperCase() }), type: form.type, value: form.type === 'free_delivery' ? 0 : Number(form.value),
      maxDiscount: form.type === 'percent' ? num(form.maxDiscount) ?? null : null, minOrderValue: num(form.minOrderValue) ?? 0,
      startsAt: form.startsAt ? `${form.startsAt}T00:00:00+06:00` : null, expiresAt: form.expiresAt ? `${form.expiresAt}T23:59:59+06:00` : null,
      usageLimit: num(form.usageLimit) ?? null, perCustomerLimit: num(form.perCustomerLimit) ?? null,
    };
    setBusy(true); setErrs(null); setFlash(null);
    try {
      await adminFetch(editing ? `/admin/coupons/${editing}` : '/admin/coupons', { method: editing ? 'PATCH' : 'POST', body });
      setFlash({ tone: 'success', text: editing ? 'Coupon updated.' : 'Coupon created.' }); setForm(null); await reload();
    } catch (e) { setErrs(errMsg(e, 'Could not save the coupon')); } finally { setBusy(false); }
  };
  const toggle = async (c: Coupon) => {
    setFlash(null);
    try { await adminFetch(`/admin/coupons/${c._id}`, c.isActive ? { method: 'DELETE' } : { method: 'PATCH', body: { isActive: true } }); await reload(); } catch (e) { setFlash({ tone: 'error', text: errMsg(e, 'Could not change the coupon') }); }
  };
  const showUsage = async (c: Coupon) => {
    try { setUsage({ code: c.code, rows: (await adminFetch<{ items: Usage[] }>(`/admin/coupons/${c._id}/usage`)).data.items }); } catch (e) { setFlash({ tone: 'error', text: errMsg(e, 'Could not load usage') }); }
  };
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(form ? { ...form, [k]: e.target.value } : form);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-bold">Coupons</h1><p className="text-sm text-charcoal-soft">Discount codes customers type at checkout. The server checks every rule again when the order is placed.</p></div><Btn onClick={() => open()}>New coupon</Btn></div>
      {flash && <Alert tone={flash.tone}>{flash.text}</Alert>}

      {form && (
        <Card title={editing ? `Edit ${form.code}` : 'New coupon'}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Code"><Input value={form.code} onChange={set('code')} disabled={!!editing} maxLength={30} autoCapitalize="characters" placeholder="WELCOME10" /></Field>
            <Field label="Type"><Select value={form.type} onChange={set('type')}><option value="percent">Percent off</option><option value="fixed">Fixed amount off</option><option value="free_delivery">Free delivery</option></Select></Field>
            {form.type !== 'free_delivery' && <Field label={form.type === 'percent' ? 'Percent (1–100)' : 'Amount (৳)'}><Input inputMode="numeric" value={form.value} onChange={set('value')} /></Field>}
            {form.type === 'percent' && <Field label="Maximum discount (৳, optional)"><Input inputMode="numeric" value={form.maxDiscount} onChange={set('maxDiscount')} /></Field>}
            <Field label="Minimum order (৳, optional)"><Input inputMode="numeric" value={form.minOrderValue} onChange={set('minOrderValue')} /></Field>
            <Field label="Starts (optional)"><Input type="date" value={form.startsAt} onChange={set('startsAt')} /></Field>
            <Field label="Ends (optional)"><Input type="date" value={form.expiresAt} onChange={set('expiresAt')} /></Field>
            <Field label="Total uses allowed (optional)"><Input inputMode="numeric" value={form.usageLimit} onChange={set('usageLimit')} /></Field>
            <Field label="Uses per customer (optional)"><Input inputMode="numeric" value={form.perCustomerLimit} onChange={set('perCustomerLimit')} /></Field>
          </div>
          {errs && <div className="mt-3"><Alert>{errs}</Alert></div>}
          <div className="mt-4 flex gap-2"><Btn disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save coupon'}</Btn><Btn tone="secondary" onClick={() => setForm(null)}>Cancel</Btn></div>
        </Card>
      )}

      <Card>
        {error && <Alert>{error} <button className="font-semibold underline" onClick={() => void reload()}>Retry</button></Alert>}
        {!error && !data && <p role="status" className="py-8 text-center text-charcoal-soft">Loading…</p>}
        {data && data.length === 0 && <p className="py-8 text-center text-charcoal-soft">No coupons yet. Create one to offer a discount.</p>}
        {data && data.length > 0 && (
          <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm">
            <thead><tr className="border-b border-sage/50 text-xs uppercase tracking-wide text-charcoal-soft"><th className="py-2 pr-3">Code</th><th className="px-3">Discount</th><th className="px-3">Used</th><th className="px-3">Valid</th><th className="px-3">Status</th><th className="px-3 text-right">Actions</th></tr></thead>
            <tbody>
              {data.map((c) => {
                const s = state(c);
                return (
                  <tr key={c._id} className="border-b border-sage/30 align-top last:border-0">
                    <td className="py-3 pr-3 font-mono font-semibold">{c.code}{c.minOrderValue ? <span className="block font-sans text-xs font-normal text-charcoal-soft">min {formatTaka(c.minOrderValue, 'en')}</span> : null}</td>
                    <td className="px-3">{describe(c)}</td>
                    <td className="px-3">{c.usedCount}{c.usageLimit != null ? ` / ${c.usageLimit}` : ''}{c.perCustomerLimit ? <span className="block text-xs text-charcoal-soft">{c.perCustomerLimit} per customer</span> : null}</td>
                    <td className="px-3 text-xs text-charcoal-soft">{c.startsAt ? `from ${day(c.startsAt)}` : 'no start'}<br />{c.expiresAt ? `until ${day(c.expiresAt)}` : 'no end'}</td>
                    <td className="px-3"><Badge kind={s.kind}>{s.label}</Badge></td>
                    <td className="space-x-1 px-3 text-right"><Btn tone="secondary" className="min-h-9 px-3" onClick={() => open(c)}>Edit</Btn><Btn tone="ghost" className="min-h-9 px-3" onClick={() => void showUsage(c)}>Usage</Btn><Btn tone="ghost" className="min-h-9 px-3" onClick={() => void toggle(c)}>{c.isActive ? 'Turn off' : 'Turn on'}</Btn></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </Card>

      {usage && (
        <Card title={`Uses of ${usage.code}`} actions={<Btn tone="ghost" onClick={() => setUsage(null)}>Close</Btn>}>
          {usage.rows.length === 0 ? <p className="text-sm text-charcoal-soft">Not used yet.</p> : <ul className="space-y-1 text-sm">{usage.rows.map((u) => <li key={u._id}>{new Date(u.createdAt).toLocaleString()} · {u.phone ? `${u.phone.slice(0, 3)}*****${u.phone.slice(-3)}` : 'customer'}</li>)}</ul>}
        </Card>
      )}
    </div>
  );
}
