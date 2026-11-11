import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatTaka } from '@/lib/format';
import { adminFetch } from '../auth';
import { dhakaDate, useLoad } from '../hooks';
import { Alert, Badge, Btn, Card, Field, Input } from '../ui';
import { label } from './OrdersPage';

interface Summary {
  range: { from: string; to: string; days: number };
  revenue: number; revenueOrders: number; averageOrderValue: number; ordersPlaced: number; pendingOrders: number; completedOrders: number;
  ordersByStatus: Record<string, number>; customers: { newCustomers: number; returningCustomers: number };
  paymentSplit: { cod: { revenue: number; orders: number }; prepaid: { revenue: number; orders: number } }; definition: string;
}
interface Point { date: string; revenue: number; orders: number }
interface Best { product: string; name: string; quantity: number; revenue: number }
interface Recent { id: string; orderNo: string; name: string; total: number; status: string; paymentMethod: string; createdAt: string }
interface Low { productId: string; name: string; label: string; sku: string; stock: number; threshold: number; published: boolean }

const m = (n: number) => formatTaka(n, 'en');
const PRESETS = [{ id: 'today', label: 'Today', days: 0 }, { id: '7', label: 'Last 7 days', days: 6 }, { id: '30', label: 'Last 30 days', days: 29 }] as const;

/** Bars drawn with plain SVG (no chart library). Each bar has a text label for screen readers. */
function SalesChart({ points }: { points: Point[] }) {
  const max = Math.max(1, ...points.map((p) => p.revenue));
  const W = 600, H = 160, gap = points.length > 45 ? 1 : 3;
  const bw = Math.max(2, (W - gap * (points.length - 1)) / points.length);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 20}`} role="img" aria-label={`Daily revenue, ${points[0]?.date} to ${points.at(-1)?.date}`} className="h-auto w-full">
        {points.map((p, i) => {
          const h = Math.round((p.revenue / max) * H);
          return <rect key={p.date} x={i * (bw + gap)} y={H - h} width={bw} height={Math.max(h, p.revenue > 0 ? 2 : 0)} rx={2} className="fill-forest/80"><title>{`${p.date}: ${m(p.revenue)} · ${p.orders} order${p.orders === 1 ? '' : 's'}`}</title></rect>;
        })}
        <line x1="0" x2={W} y1={H} y2={H} className="stroke-sage" />
        <text x="0" y={H + 15} className="fill-charcoal-soft text-[10px]">{points[0]?.date}</text>
        <text x={W} y={H + 15} textAnchor="end" className="fill-charcoal-soft text-[10px]">{points.at(-1)?.date}</text>
      </svg>
      <figcaption className="sr-only">{points.map((p) => `${p.date}: ${m(p.revenue)}`).join('; ')}</figcaption>
    </figure>
  );
}

function Stat({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return <div className="rounded-xl bg-white p-4 shadow-card"><p className="text-xs uppercase tracking-wide text-charcoal-soft">{title}</p><p className="mt-1 text-2xl font-bold text-forest">{value}</p>{hint && <p className="mt-0.5 text-xs text-charcoal-soft">{hint}</p>}</div>;
}

export default function DashboardPage() {
  const [preset, setPreset] = useState<string>('30');
  const [from, setFrom] = useState(dhakaDate(-29));
  const [to, setTo] = useState(dhakaDate());
  const range = preset === 'custom' ? { from, to } : { from: dhakaDate(-(PRESETS.find((p) => p.id === preset)?.days ?? 29)), to: dhakaDate() };
  const key = `${range.from}|${range.to}`;
  const q = { from: range.from, to: range.to };

  const sum = useLoad(async () => (await adminFetch<Summary>('/admin/dashboard/summary', { query: q })).data, key);
  const chart = useLoad(async () => (await adminFetch<{ points: Point[] }>('/admin/dashboard/sales-chart', { query: q })).data.points, key);
  const best = useLoad(async () => (await adminFetch<{ items: Best[] }>('/admin/dashboard/best-sellers', { query: q })).data.items, key);
  const recent = useLoad(async () => (await adminFetch<{ items: Recent[] }>('/admin/dashboard/recent-orders')).data.items, 'recent');
  const low = useLoad(async () => (await adminFetch<{ items: Low[] }>('/admin/dashboard/low-stock')).data.items, 'low');
  const s = sum.data;
  const reloadAll = () => { void sum.reload(); void chart.reload(); void best.reload(); void recent.reload(); void low.reload(); };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-bold">Dashboard</h1><p className="text-sm text-charcoal-soft">How the shop is doing. Days are Bangladesh days.</p></div>
        <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Date range">
          {PRESETS.map((p) => <Btn key={p.id} tone={preset === p.id ? 'primary' : 'secondary'} aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>{p.label}</Btn>)}
          <Btn tone={preset === 'custom' ? 'primary' : 'secondary'} aria-pressed={preset === 'custom'} onClick={() => setPreset('custom')}>Custom</Btn>
        </div>
      </div>
      {preset === 'custom' && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} min={from} max={dhakaDate()} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      )}

      {sum.error && <Alert>{sum.error} <button className="font-semibold underline" onClick={reloadAll}>Retry</button></Alert>}
      {!s && !sum.error && <p role="status" className="py-10 text-center text-charcoal-soft">Loading…</p>}
      {s && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat title="Revenue" value={m(s.revenue)} hint={`${s.revenueOrders} order${s.revenueOrders === 1 ? '' : 's'} · avg ${m(s.averageOrderValue)}`} />
            <Stat title="Orders placed" value={String(s.ordersPlaced)} hint={`${s.completedOrders} delivered`} />
            <Stat title="Waiting to be confirmed" value={String(s.pendingOrders)} hint="right now, all time" />
            <Stat title="Customers" value={String(s.customers.newCustomers + s.customers.returningCustomers)} hint={`${s.customers.newCustomers} new · ${s.customers.returningCustomers} returning`} />
          </div>
          <p className="text-xs text-charcoal-soft">{s.definition}</p>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="Daily revenue" className="lg:col-span-2">
              {chart.error ? <Alert>{chart.error}</Alert> : !chart.data ? <p role="status" className="py-8 text-center text-charcoal-soft">Loading…</p> : chart.data.every((p) => p.revenue === 0) ? <p className="py-8 text-center text-charcoal-soft">No revenue in this period yet.</p> : <SalesChart points={chart.data} />}
            </Card>
            <Card title="Cash on delivery vs prepaid">
              <dl className="space-y-3 text-sm">
                <div><dt className="text-charcoal-soft">Cash on Delivery</dt><dd className="text-xl font-bold">{m(s.paymentSplit.cod.revenue)} <span className="text-sm font-normal text-charcoal-soft">· {s.paymentSplit.cod.orders} orders</span></dd></div>
                <div><dt className="text-charcoal-soft">Prepaid (bKash / bank)</dt><dd className="text-xl font-bold">{m(s.paymentSplit.prepaid.revenue)} <span className="text-sm font-normal text-charcoal-soft">· {s.paymentSplit.prepaid.orders} orders</span></dd></div>
              </dl>
              <h3 className="mb-1 mt-4 text-sm font-bold">Orders by status</h3>
              <ul className="space-y-1 text-sm">{Object.entries(s.ordersByStatus).filter(([, n]) => n > 0).map(([k, n]) => <li key={k} className="flex justify-between"><span className="capitalize">{label(k)}</span><span className="font-semibold">{n}</span></li>)}{s.ordersPlaced === 0 && <li className="text-charcoal-soft">No orders in this period.</li>}</ul>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Best sellers">
              {best.error ? <Alert>{best.error}</Alert> : !best.data ? <p role="status" className="text-charcoal-soft">Loading…</p> : best.data.length === 0 ? <p className="text-sm text-charcoal-soft">No sales in this period.</p> : (
                <ol className="space-y-2 text-sm">{best.data.map((b, i) => <li key={b.product} className="flex items-center justify-between gap-3"><span><span className="mr-2 text-charcoal-soft">{i + 1}.</span>{b.name}</span><span className="font-semibold">{b.quantity} sold · {m(b.revenue)}</span></li>)}</ol>
              )}
            </Card>
            <Card title="Low stock" actions={<Link to="/admin/inventory" className="text-sm font-semibold text-forest hover:underline">Open inventory</Link>}>
              {low.error ? <Alert>{low.error}</Alert> : !low.data ? <p role="status" className="text-charcoal-soft">Loading…</p> : low.data.length === 0 ? <p className="text-sm text-charcoal-soft">Every product is above its alert level.</p> : (
                <ul className="space-y-2 text-sm">{low.data.map((l) => <li key={l.sku} className="flex items-center justify-between gap-3"><span>{l.name} <span className="text-charcoal-soft">({l.label})</span></span><span><Badge kind={l.stock === 0 ? 'out_of_stock' : 'low_stock'}>{l.stock === 0 ? 'Out of stock' : `${l.stock} left`}</Badge></span></li>)}</ul>
              )}
            </Card>
          </div>

          <Card title="Recent orders" actions={<Link to="/admin/orders" className="text-sm font-semibold text-forest hover:underline">All orders</Link>}>
            {recent.error ? <Alert>{recent.error}</Alert> : !recent.data ? <p role="status" className="text-charcoal-soft">Loading…</p> : recent.data.length === 0 ? <p className="text-sm text-charcoal-soft">No orders yet.</p> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><tbody>
                {recent.data.map((o) => <tr key={o.id} className="border-b border-sage/30 last:border-0"><td className="py-2 pr-3"><Link to={`/admin/orders/${o.id}`} className="font-mono font-semibold text-forest hover:underline">{o.orderNo}</Link><span className="block text-xs text-charcoal-soft">{new Date(o.createdAt).toLocaleString()}</span></td><td className="px-3">{o.name}</td><td className="px-3 font-semibold">{m(o.total)}<span className="block text-xs font-normal text-charcoal-soft">{o.paymentMethod === 'cod' ? 'COD' : 'prepaid'}</span></td><td className="px-3"><Badge kind={o.status === 'cancelled' ? 'out_of_stock' : 'draft'}>{label(o.status)}</Badge></td></tr>)}
              </tbody></table></div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
