import { Search } from 'lucide-react';
import { useCallback, useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { formatTaka } from '@/lib/format';
import { adminFetch, downloadFile, useAdminAuth } from '../auth';
import { Alert, Badge, Btn, Card, Field, Input, Pager, Select } from '../ui';

export interface OrderRow {
  _id: string; orderNo: string; status: string; paymentStatus: string; paymentMethod: string; total: number; createdAt: string;
  customer: { name: string; phone: string; district: string; city: string };
  items: { name: string; quantity: number }[];
}

const statusTone: Record<string, string> = { pending: 'draft', confirmed: 'published', processing: 'published', shipped: 'published', out_for_delivery: 'published', delivered: 'published', cancelled: 'out_of_stock', returned: 'hidden' };
export const label = (s: string) => s.replace(/_/g, ' ');

export interface Attention { newOrders: number; cancelRequests: number; returnRequests: number; manualPayments: number; pendingReviews: number }

/** The owner's "what needs me" strip + the order settings that were previously only in the database. */
function SettingsCard() {
  const [s, setS] = useState<{ autoConfirm: boolean; returnWindowDays: number | null } | null>(null);
  const [days, setDays] = useState('');
  const [note, setNote] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  useEffect(() => { adminFetch<{ autoConfirm: boolean; returnWindowDays: number | null }>('/admin/settings/orders').then((r) => { setS(r.data); setDays(r.data.returnWindowDays == null ? '' : String(r.data.returnWindowDays)); }).catch(() => setNote({ tone: 'error', text: 'Could not load order settings' })); }, []);
  const save = async (body: object, ok: string) => {
    setNote(null);
    try { const r = await adminFetch<{ autoConfirm: boolean; returnWindowDays: number | null }>('/admin/settings/orders', { method: 'PATCH', body }); setS(r.data); setNote({ tone: 'success', text: ok }); } catch (e) { setNote({ tone: 'error', text: e instanceof ApiError ? e.message : 'Could not save' }); }
  };
  if (!s) return null;
  return (
    <Card title="Order settings">
      <div className="space-y-3">
        {note && <Alert tone={note.tone}>{note.text}</Alert>}
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-forest" checked={s.autoConfirm} onChange={(e) => void save({ autoConfirm: e.target.checked }, 'Saved')} /><span><span className="font-semibold">Confirm Cash-on-Delivery orders automatically</span><span className="block text-xs text-charcoal-soft">Leave off if you confirm each order with the customer on WhatsApp first (recommended).</span></span></label>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Return window (days after delivery)" hint="Empty = online return requests are off; customers are asked to message you."><Input className="w-40" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} /></Field>
          <Btn tone="secondary" onClick={() => void save({ returnWindowDays: days === '' ? null : Number(days) }, 'Saved')}>Save</Btn>
        </div>
      </div>
    </Card>
  );
}

export default function OrdersPage() {
  const role = useAdminAuth((a) => a.account?.role);
  const canManage = role === 'admin' || role === 'superadmin';
  const [att, setAtt] = useState<Attention | null>(null);
  useEffect(() => { adminFetch<Attention>('/admin/orders/summary').then((r) => setAtt(r.data)).catch(() => undefined); }, []);
  const [exportErr, setExportErr] = useState<string | null>(null);
  return <OrdersList att={att} canManage={canManage} exportErr={exportErr} onExport={() => { setExportErr(null); void downloadFile('/admin/orders/export', 'orders.csv').catch((e) => setExportErr(e instanceof ApiError ? e.message : 'Export failed')); }} />;
}

function OrdersList({ att, canManage, exportErr, onExport }: { att: Attention | null; canManage: boolean; exportErr: string | null; onExport: () => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [payType, setPayType] = useState('');
  const [method, setMethod] = useState('');
  const [district, setDistrict] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('newest');
  const [districts, setDistricts] = useState<string[]>([]);
  useEffect(() => { adminFetch<{ districts: string[] }>('/delivery/zones').then((r) => setDistricts(r.data.districts)).catch(() => undefined); }, []);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const limit = 20;

  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  // Only the newest request may update the screen: a slow earlier response must never overwrite a newer filter's results.
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    setError(null);
    try {
      const r = await adminFetch<{ items: OrderRow[] }>('/admin/orders', { query: { page, limit, q: debounced, status, payType, method, district, from, to, sort } });
      if (mine !== seq.current) return;
      setRows(r.data.items); setTotal(r.meta?.total ?? 0);
    } catch (e) { if (mine === seq.current) setError(e instanceof ApiError ? e.message : 'Failed to load orders'); }
  }, [page, debounced, status, payType, method, district, from, to, sort]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-bold">Orders</h1><p className="text-sm text-charcoal-soft">Open an order to confirm it (WhatsApp message included), ship, cancel or record a return.</p></div>{canManage && <Btn tone="secondary" onClick={onExport}>Export CSV</Btn>}</div>
      {exportErr && <Alert>{exportErr}</Alert>}
      {att && (att.newOrders + att.cancelRequests + att.returnRequests + att.manualPayments + att.pendingReviews > 0) && (
        <Card title="Needs your attention">
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {att.newOrders > 0 && <li><strong>{att.newOrders}</strong> new order{att.newOrders === 1 ? '' : 's'} to confirm</li>}
            {att.cancelRequests > 0 && <li><strong>{att.cancelRequests}</strong> cancellation request{att.cancelRequests === 1 ? '' : 's'}</li>}
            {att.returnRequests > 0 && <li><strong>{att.returnRequests}</strong> return request{att.returnRequests === 1 ? '' : 's'}</li>}
            {att.manualPayments > 0 && <li><Link to="/admin/payments" className="underline"><strong>{att.manualPayments}</strong> payment{att.manualPayments === 1 ? '' : 's'} to check</Link></li>}
            {att.pendingReviews > 0 && <li><Link to="/admin/reviews" className="underline"><strong>{att.pendingReviews}</strong> review{att.pendingReviews === 1 ? '' : 's'} to approve</Link></li>}
          </ul>
        </Card>
      )}
      {canManage && <SettingsCard />}
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px_200px]">
          <div className="relative"><Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-soft" /><Input aria-label="Search orders" placeholder="Order number, name or phone" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>{['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </Select>
          <Select aria-label="Filter by payment type" value={payType} onChange={(e) => { setPayType(e.target.value); setPage(1); }}>
            <option value="">COD and prepaid</option><option value="cod">Cash on Delivery only</option><option value="prepaid">Prepaid only</option>
          </Select>
        </div>
        <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="From"><Input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></Field>
          <Field label="To"><Input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></Field>
          <Field label="District"><Select value={district} onChange={(e) => { setDistrict(e.target.value); setPage(1); }}><option value="">All districts</option>{districts.map((d) => <option key={d} value={d}>{d}</option>)}</Select></Field>
          <Field label="Payment method"><Select value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }}><option value="">Any method</option><option value="cod">Cash on Delivery</option><option value="manual_bkash">bKash</option><option value="manual_nagad">Nagad</option><option value="manual_rocket">Rocket</option><option value="manual_bank">Bank transfer</option></Select></Field>
          <Field label="Sort by"><Select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="total_desc">Highest total</option><option value="total_asc">Lowest total</option></Select></Field>
          <div className="flex items-end"><Btn tone="ghost" onClick={() => { setQ(''); setStatus(''); setPayType(''); setMethod(''); setDistrict(''); setFrom(''); setTo(''); setSort('newest'); setPage(1); }}>Clear filters</Btn></div>
        </div>
        {error && <Alert>{error} <button className="font-semibold underline" onClick={() => void load()}>Retry</button></Alert>}
        {!error && rows === null && <p role="status" className="py-8 text-center text-charcoal-soft">Loading…</p>}
        {rows && rows.length === 0 && <p className="py-8 text-center text-charcoal-soft">No orders found.</p>}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead><tr className="border-b border-sage/50 text-xs uppercase tracking-wide text-charcoal-soft"><th className="py-2 pr-3">Order</th><th className="px-3">Customer</th><th className="px-3">Items</th><th className="px-3">Total</th><th className="px-3">Status</th></tr></thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o._id} className="border-b border-sage/30 last:border-0">
                    <td className="py-3 pr-3"><Link to={`/admin/orders/${o._id}`} className="font-mono font-semibold text-forest hover:underline">{o.orderNo}</Link><span className="block text-xs text-charcoal-soft">{new Date(o.createdAt).toLocaleString()}</span></td>
                    <td className="px-3">{o.customer.name}<span className="block text-xs text-charcoal-soft">{o.customer.phone} · {o.customer.district}</span></td>
                    <td className="px-3 text-charcoal-soft">{o.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}</td>
                    <td className="px-3 font-semibold">{formatTaka(o.total, 'en')}<span className="block text-xs font-normal text-charcoal-soft">{o.paymentMethod === 'cod' ? 'COD' : o.paymentMethod.replace('manual_', '')} · {label(o.paymentStatus)}</span></td>
                    <td className="px-3"><Badge kind={statusTone[o.status] ?? 'draft'}>{label(o.status)}</Badge></td>
                  </tr>
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
