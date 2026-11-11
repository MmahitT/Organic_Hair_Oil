import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatTaka } from '@/lib/format';
import { adminFetch, downloadFile } from '../auth';
import { errMsg, useLoad } from '../hooks';
import { Alert, Badge, Btn, Card, Field, Input, Pager, Select, Textarea } from '../ui';
import { label } from './OrdersPage';

interface Row { phone: string; name: string; district: string; orders: number; spent: number; firstOrderAt: string; lastOrderAt: string; isBlocked: boolean; hasNotes: boolean; returning: boolean }
interface Detail {
  phone: string; name: string; orders: number; spent: number; firstOrderAt: string; lastOrderAt: string; returning: boolean; email: string | null; hasAccount: boolean; isBlocked: boolean; notes: string;
  addresses: { address: string; city: string; district: string }[];
  recentOrders: { id: string; orderNo: string; status: string; paymentStatus: string; paymentMethod: string; total: number; createdAt: string; items: string }[];
}
const m = (n: number) => formatTaka(n, 'en');

export function CustomersPage() {
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [sort, setSort] = useState('recent');
  const [blocked, setBlocked] = useState('');
  const [page, setPage] = useState(1);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const limit = 20;
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const { data, error, reload } = useLoad(async () => { const r = await adminFetch<{ items: Row[] }>('/admin/customers', { query: { page, limit, q: dq, sort, blocked } }); return { items: r.data.items, total: r.meta?.total ?? 0 }; }, `${page}|${dq}|${sort}|${blocked}`);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-3xl font-bold">Customers</h1><p className="text-sm text-charcoal-soft">Built from orders, so guests are included. “Spent” counts confirmed-or-later orders only.</p></div>
        <Btn tone="secondary" onClick={() => { setExportErr(null); void downloadFile('/admin/customers/export', 'customers.csv').catch((e) => setExportErr(errMsg(e, 'Export failed'))); }}>Export CSV</Btn>
      </div>
      {exportErr && <Alert>{exportErr}</Alert>}
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px_180px]">
          <div className="relative"><Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-soft" /><Input aria-label="Search customers" placeholder="Name or phone" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select aria-label="Sort" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}><option value="recent">Most recent</option><option value="spent">Highest spend</option><option value="orders">Most orders</option></Select>
          <Select aria-label="Filter blocked" value={blocked} onChange={(e) => { setBlocked(e.target.value); setPage(1); }}><option value="">All customers</option><option value="true">Blocked only</option><option value="false">Not blocked</option></Select>
        </div>
        {error && <Alert>{error} <button className="font-semibold underline" onClick={() => void reload()}>Retry</button></Alert>}
        {!error && !data && <p role="status" className="py-8 text-center text-charcoal-soft">Loading…</p>}
        {data && data.items.length === 0 && <p className="py-8 text-center text-charcoal-soft">No customers found.</p>}
        {data && data.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead><tr className="border-b border-sage/50 text-xs uppercase tracking-wide text-charcoal-soft"><th className="py-2 pr-3">Customer</th><th className="px-3">Orders</th><th className="px-3">Spent</th><th className="px-3">Last order</th><th className="px-3" /></tr></thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.phone} className="border-b border-sage/30 last:border-0">
                    <td className="py-3 pr-3"><Link to={`/admin/customers/${c.phone}`} className="font-semibold text-forest hover:underline">{c.name}</Link><span className="block text-xs text-charcoal-soft">{c.phone} · {c.district}</span></td>
                    <td className="px-3">{c.orders}{c.returning && <span className="ml-1 text-xs text-charcoal-soft">returning</span>}</td>
                    <td className="px-3 font-semibold">{m(c.spent)}</td>
                    <td className="px-3 text-charcoal-soft">{new Date(c.lastOrderAt).toLocaleDateString()}</td>
                    <td className="px-3 text-right">{c.isBlocked && <Badge kind="out_of_stock">blocked</Badge>}{c.hasNotes && <span className="ml-1 text-xs text-charcoal-soft">note</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} limit={limit} total={data?.total ?? 0} onPage={setPage} />
      </Card>
    </div>
  );
}

export function CustomerDetailPage() {
  const { phone } = useParams();
  const { data: c, error, reload, setData } = useLoad(async () => (await adminFetch<{ customer: Detail }>(`/admin/customers/${phone}`)).data.customer, phone ?? '');
  const [notes, setNotes] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  const save = async (body: object, ok: string) => {
    setBusy(true); setFlash(null);
    try { const r = await adminFetch<{ customer: Detail }>(`/admin/customers/${phone}`, { method: 'PATCH', body }); setData(r.data.customer); setNotes(null); setConfirmBlock(false); setFlash({ tone: 'success', text: ok }); } catch (e) { setFlash({ tone: 'error', text: errMsg(e, 'Could not save') }); } finally { setBusy(false); }
  };
  if (error) return <div className="mx-auto max-w-3xl space-y-3"><Link to="/admin/customers" className="text-sm font-semibold text-forest hover:underline">← Customers</Link><Alert>{error} <button className="font-semibold underline" onClick={() => void reload()}>Retry</button></Alert></div>;
  if (!c) return <p role="status" className="p-8 text-center text-charcoal-soft">Loading…</p>;
  const wa = `https://wa.me/88${c.phone}`;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link to="/admin/customers" className="text-sm font-semibold text-forest hover:underline">← Customers</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold">{c.name}</h1>{c.isBlocked && <Badge kind="out_of_stock">blocked</Badge>}{c.returning && <Badge kind="published">returning</Badge>}</div>
        <p className="text-sm text-charcoal-soft"><a href={`tel:${c.phone}`} className="text-forest hover:underline">{c.phone}</a> · <a href={wa} target="_blank" rel="noreferrer" className="text-forest hover:underline">WhatsApp</a>{c.email ? ` · ${c.email}` : ''}</p>
      </div>
      {flash && <Alert tone={flash.tone}>{flash.text}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-card"><p className="text-xs uppercase text-charcoal-soft">Orders</p><p className="text-2xl font-bold text-forest">{c.orders}</p></div>
        <div className="rounded-xl bg-white p-4 shadow-card"><p className="text-xs uppercase text-charcoal-soft">Spent</p><p className="text-2xl font-bold text-forest">{m(c.spent)}</p></div>
        <div className="rounded-xl bg-white p-4 shadow-card"><p className="text-xs uppercase text-charcoal-soft">Customer since</p><p className="text-2xl font-bold text-forest">{new Date(c.firstOrderAt).toLocaleDateString()}</p></div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Your notes (private)">
          <Field label="Notes about this customer"><Textarea rows={4} maxLength={1000} value={notes ?? c.notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. prefers evening delivery" /></Field>
          <Btn className="mt-3" disabled={busy || notes === null} onClick={() => void save({ notes: notes ?? '' }, 'Notes saved.')}>Save notes</Btn>
        </Card>
        <Card title="Blocking">
          <p className="text-sm text-charcoal-soft">{c.isBlocked ? 'This customer cannot place new orders or sign in. Existing orders are not affected.' : 'Block a customer who keeps refusing deliveries or abusing the shop. They will not be able to place new orders or sign in.'}</p>
          {c.isBlocked
            ? <Btn className="mt-3" tone="secondary" disabled={busy} onClick={() => void save({ isBlocked: false }, 'Customer unblocked.')}>Unblock customer</Btn>
            : confirmBlock
              ? <div className="mt-3 flex flex-wrap gap-2"><Btn tone="danger" disabled={busy} onClick={() => void save({ isBlocked: true }, 'Customer blocked.')}>Yes, block {c.name}</Btn><Btn tone="secondary" onClick={() => setConfirmBlock(false)}>Cancel</Btn></div>
              : <Btn className="mt-3" tone="danger" onClick={() => setConfirmBlock(true)}>Block customer</Btn>}
          {c.addresses.length > 0 && <><h3 className="mb-1 mt-5 text-sm font-bold">Recent addresses</h3><ul className="space-y-1 text-sm text-charcoal-soft">{c.addresses.map((a, i) => <li key={i}>{a.address}, {a.city}, {a.district}</li>)}</ul></>}
        </Card>
      </div>

      <Card title="Order history">
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><tbody>
          {c.recentOrders.map((o) => <tr key={o.id} className="border-b border-sage/30 last:border-0"><td className="py-2 pr-3"><Link to={`/admin/orders/${o.id}`} className="font-mono font-semibold text-forest hover:underline">{o.orderNo}</Link><span className="block text-xs text-charcoal-soft">{new Date(o.createdAt).toLocaleString()}</span></td><td className="px-3 text-charcoal-soft">{o.items}</td><td className="px-3 font-semibold">{m(o.total)}<span className="block text-xs font-normal text-charcoal-soft">{o.paymentMethod === 'cod' ? 'COD' : o.paymentMethod.replace('manual_', '')} · {label(o.paymentStatus)}</span></td><td className="px-3"><Badge kind={o.status === 'cancelled' ? 'out_of_stock' : 'draft'}>{label(o.status)}</Badge></td></tr>)}
        </tbody></table></div>
      </Card>
    </div>
  );
}
