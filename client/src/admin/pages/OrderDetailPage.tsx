import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { formatTaka } from '@/lib/format';
import { adminFetch, openInvoice } from '../auth';
import { Alert, Badge, Btn, Card, Field, Input, Textarea } from '../ui';
import { label } from './OrdersPage';

interface Order {
  _id: string; orderNo: string; status: string; paymentStatus: string; paymentMethod: string; createdAt: string; deliveredAt?: string; notes?: string;
  customer: { name: string; phone: string; email?: string; district: string; city: string; address: string; instructions?: string };
  items: { name: string; variantSku: string; unitPrice: number; quantity: number; lineTotal: number; components: { name: string; sku: string; quantity: number }[] }[];
  subtotal: number; productDiscount: number; couponDiscount: number; deliveryFee: number; total: number;
  coupon?: { code: string }; deliveryZone?: { name: string };
  courier?: { name?: string; trackingNo?: string; consignmentId?: string };
  cancellation?: { status?: string; reason?: string; requestedAt?: string };
  returnInfo?: { status?: string; reason?: string; requestedAt?: string; restock?: boolean };
  statusHistory: { status: string; at: string; by?: string; note?: string }[];
}

/** Mirrors the server's forward-only workflow; the server is the one that enforces it. */
const NEXT: Record<string, string[]> = { pending: ['confirmed'], confirmed: ['processing', 'shipped'], processing: ['shipped'], shipped: ['out_for_delivery', 'delivered'], out_for_delivery: ['delivered'] };
const CANCELLABLE = ['pending', 'confirmed', 'processing'];
const RETURNABLE = ['shipped', 'out_for_delivery', 'delivered'];
const msg = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);

/** Prefilled click-to-chat messages. Orders are confirmed with the customer on WhatsApp. */
function waLinks(o: Order, total: string) {
  const phone = `88${o.customer.phone}`;
  const items = o.items.map((i) => `${i.name} ×${i.quantity}`).join(', ');
  const bn = `আসসালামু আলাইকুম ${o.customer.name}, আপনার অর্ডার ${o.orderNo} (${items}) — মোট ${total}। অর্ডারটি নিশ্চিত করতে অনুগ্রহ করে "হ্যাঁ" লিখে রিপ্লাই দিন। ধন্যবাদ।`;
  const en = `Hello ${o.customer.name}, your order ${o.orderNo} (${items}) — total ${total}. Please reply "YES" to confirm your order. Thank you.`;
  return { bn: `https://wa.me/${phone}?text=${encodeURIComponent(bn)}`, en: `https://wa.me/${phone}?text=${encodeURIComponent(en)}`, plain: `https://wa.me/${phone}` };
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const [o, setO] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<null | 'cancel' | 'return'>(null);
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [edit, setEdit] = useState({ notes: '', cName: '', cTrack: '', cConsign: '', address: '', city: '', instructions: '' });

  const load = useCallback(async () => {
    try {
      const r = await adminFetch<{ order: Order }>(`/admin/orders/${id}`);
      setO(r.data.order);
      const c = r.data.order;
      setEdit({ notes: c.notes ?? '', cName: c.courier?.name ?? '', cTrack: c.courier?.trackingNo ?? '', cConsign: c.courier?.consignmentId ?? '', address: c.customer.address, city: c.customer.city, instructions: c.customer.instructions ?? '' });
    } catch (e) { setError(msg(e, 'Failed to load order')); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const act = async (run: () => Promise<unknown>, ok: string) => {
    setBusy(true); setFlash(null);
    try { await run(); setFlash({ tone: 'success', text: ok }); setMode(null); setReason(''); await load(); } catch (e) { setFlash({ tone: 'error', text: msg(e, 'Something went wrong') }); } finally { setBusy(false); }
  };
  const post = (path: string, body: object, method = 'POST') => adminFetch(`/admin/orders/${id}${path}`, { method, body });

  const m = (n: number) => formatTaka(n, 'en');
  if (error) return <div className="mx-auto max-w-3xl space-y-3"><Link to="/admin/orders" className="text-sm font-semibold text-forest hover:underline">← Orders</Link><Alert>{error}</Alert></div>;
  if (!o) return <p role="status" className="p-8 text-center text-charcoal-soft">Loading…</p>;
  const wa = waLinks(o, m(o.total));
  const next = NEXT[o.status] ?? [];
  const unpaid = o.paymentMethod !== 'cod' && o.paymentStatus !== 'paid';
  const canEditAddress = CANCELLABLE.includes(o.status);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div><Link to="/admin/orders" className="text-sm font-semibold text-forest hover:underline">← Orders</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3"><h1 className="font-mono text-3xl font-bold">{o.orderNo}</h1><Badge kind={o.status === 'cancelled' ? 'out_of_stock' : 'draft'}>{label(o.status)}</Badge><Badge kind="hidden">{label(o.paymentStatus)}</Badge></div>
        <p className="text-sm text-charcoal-soft">Placed {new Date(o.createdAt).toLocaleString()} · {o.paymentMethod === 'cod' ? 'Cash on Delivery' : o.paymentMethod}</p></div>

      {flash && <Alert tone={flash.tone}>{flash.text}</Alert>}

      {(o.cancellation?.status === 'requested' || o.returnInfo?.status === 'requested') && (
        <Card title="Customer request">
          {(['cancellation', 'return'] as const).map((k) => {
            const r = k === 'cancellation' ? o.cancellation : o.returnInfo;
            if (r?.status !== 'requested') return null;
            return (
              <div key={k} className="space-y-2 text-sm">
                <p><strong className="capitalize">{k} requested</strong> {r.requestedAt && <span className="text-charcoal-soft">· {new Date(r.requestedAt).toLocaleString()}</span>}</p>
                <p className="rounded-lg bg-cream p-3">“{r.reason}”</p>
                <div className="flex flex-wrap gap-2">
                  <Btn disabled={busy} onClick={() => void act(() => post(`/requests/${k}`, { approve: true }), k === 'cancellation' ? 'Order cancelled and stock restored.' : 'Return approved. Arrange pickup, then use “Process return”.')}>{k === 'cancellation' ? 'Approve & cancel order' : 'Approve return'}</Btn>
                  <Btn tone="secondary" disabled={busy} onClick={() => void act(() => post(`/requests/${k}`, { approve: false }), 'Request declined.')}>Decline</Btn>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <Card title="Next step">
        <div className="space-y-4">
          {unpaid && <Alert tone="info">Payment not received yet. <Link to="/admin/payments" className="font-semibold underline">Check Payments</Link> before processing this order.</Alert>}
          <div className="flex flex-wrap gap-2">
            {next.map((s) => <Btn key={s} disabled={busy || unpaid} onClick={() => void act(() => post('/status', { status: s }, 'PATCH'), `Order marked ${label(s)}.`)}>Mark {label(s)}</Btn>)}
            {CANCELLABLE.includes(o.status) && <Btn tone="danger" disabled={busy} onClick={() => { setMode('cancel'); setReason(''); }}>Cancel order</Btn>}
            {RETURNABLE.includes(o.status) && <Btn tone="secondary" disabled={busy} onClick={() => { setMode('return'); setReason(''); }}>Process return</Btn>}
            {next.length === 0 && !CANCELLABLE.includes(o.status) && !RETURNABLE.includes(o.status) && <p className="text-sm text-charcoal-soft">This order is closed.</p>}
          </div>
          {mode === 'cancel' && (
            <div className="space-y-3 rounded-lg border border-danger/30 bg-danger/5 p-4">
              <p className="text-sm">Cancelling returns the stock{o.coupon ? ' and the coupon use' : ''}.{o.paymentStatus === 'paid' ? ' The customer has already paid — you will need to refund them, and the payment is marked “refund pending”.' : ''}</p>
              <Field label="Reason (required)"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
              <div className="flex gap-2"><Btn tone="danger" disabled={busy || reason.trim().length < 3} onClick={() => void act(() => post('/cancel', { reason: reason.trim() }), 'Order cancelled and stock restored.')}>Yes, cancel this order</Btn><Btn tone="secondary" onClick={() => setMode(null)}>Keep order</Btn></div>
            </div>
          )}
          {mode === 'return' && (
            <div className="space-y-3 rounded-lg border border-gold/50 bg-gold/10 p-4">
              <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-forest" checked={restock} onChange={(e) => setRestock(e.target.checked)} />Goods are in sellable condition — add them back to stock</label>
              <Field label="Note (optional)"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
              <div className="flex gap-2"><Btn disabled={busy} onClick={() => void act(() => post('/return', { restock, note: reason.trim() }), 'Return recorded.')}>Record return</Btn><Btn tone="secondary" onClick={() => setMode(null)}>Cancel</Btn></div>
            </div>
          )}
          <div className="flex flex-wrap gap-3 border-t border-sage/40 pt-3 text-sm">
            <span className="text-charcoal-soft">Confirm with customer on WhatsApp:</span>
            <a href={wa.bn} target="_blank" rel="noreferrer" className="font-semibold text-forest hover:underline">বাংলা message</a>
            <a href={wa.en} target="_blank" rel="noreferrer" className="font-semibold text-forest hover:underline">English message</a>
            <button type="button" className="font-semibold text-forest hover:underline" onClick={() => void openInvoice(o._id).catch((e) => setFlash({ tone: 'error', text: msg(e, 'Could not open the invoice') }))}>Invoice (print / PDF)</button>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Customer & delivery">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-charcoal-soft">Name</dt><dd className="font-semibold">{o.customer.name}</dd></div>
            <div><dt className="text-charcoal-soft">Phone</dt><dd className="font-semibold"><a href={`tel:${o.customer.phone}`} className="text-forest hover:underline">{o.customer.phone}</a> · <a href={wa.plain} target="_blank" rel="noreferrer" className="text-forest hover:underline">WhatsApp</a></dd></div>
            {o.customer.email && <div><dt className="text-charcoal-soft">Email</dt><dd>{o.customer.email}</dd></div>}
            <div><dt className="text-charcoal-soft">Address</dt><dd className="whitespace-pre-wrap font-semibold">{o.customer.address}, {o.customer.city}, {o.customer.district}</dd></div>
            {o.customer.instructions && <div><dt className="text-charcoal-soft">Instructions</dt><dd className="font-semibold">{o.customer.instructions}</dd></div>}
            {o.deliveryZone && <div><dt className="text-charcoal-soft">Delivery zone</dt><dd>{o.deliveryZone.name}</dd></div>}
          </dl>
        </Card>
        <Card title="Totals">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{m(o.subtotal)}</dd></div>
            {o.productDiscount > 0 && <div className="flex justify-between"><dt>Product discount</dt><dd>−{m(o.productDiscount)}</dd></div>}
            {o.couponDiscount > 0 && <div className="flex justify-between"><dt>Coupon {o.coupon?.code}</dt><dd>−{m(o.couponDiscount)}</dd></div>}
            <div className="flex justify-between"><dt>Delivery</dt><dd>{o.deliveryFee === 0 ? 'Free' : m(o.deliveryFee)}</dd></div>
            <div className="flex justify-between border-t border-sage/40 pt-2 text-lg font-bold"><dt>{o.paymentMethod === 'cod' ? 'Collect on delivery' : 'Total'}</dt><dd>{m(o.total)}</dd></div>
          </dl>
        </Card>
      </div>

      <Card title="Items to pack">
        <ul className="divide-y divide-sage/40">
          {o.items.map((i) => (
            <li key={i.variantSku} className="py-3 text-sm">
              <div className="flex justify-between gap-3"><p className="font-semibold">{i.name} <span className="font-normal text-charcoal-soft">× {i.quantity} @ {m(i.unitPrice)}</span></p><p className="font-semibold">{m(i.lineTotal)}</p></div>
              <p className="mt-1 text-charcoal-soft">Pack: {i.components.map((c) => `${c.quantity} × ${c.name}`).join(' + ')}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Courier & notes">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Courier"><Input value={edit.cName} onChange={(e) => setEdit({ ...edit, cName: e.target.value })} maxLength={60} placeholder="e.g. Steadfast" /></Field>
          <Field label="Tracking number"><Input value={edit.cTrack} onChange={(e) => setEdit({ ...edit, cTrack: e.target.value })} maxLength={60} /></Field>
          <Field label="Consignment ID"><Input value={edit.cConsign} onChange={(e) => setEdit({ ...edit, cConsign: e.target.value })} maxLength={60} /></Field>
        </div>
        <Field label="Internal notes (customers never see these)" className="mt-4"><Textarea rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} maxLength={2000} /></Field>
        <Btn className="mt-3" disabled={busy} onClick={() => void act(() => post('', { notes: edit.notes, courier: { name: edit.cName, trackingNo: edit.cTrack, consignmentId: edit.cConsign } }, 'PATCH'), 'Saved.')}>Save courier & notes</Btn>
      </Card>

      {canEditAddress && (
        <Card title="Correct delivery address">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City / area"><Input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} maxLength={80} /></Field>
            <Field label="Delivery instructions"><Input value={edit.instructions} onChange={(e) => setEdit({ ...edit, instructions: e.target.value })} maxLength={300} /></Field>
            <Field label="Full address" className="sm:col-span-2"><Textarea rows={2} value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} maxLength={300} /></Field>
          </div>
          <p className="mt-2 text-xs text-charcoal-soft">The district cannot be changed here because it decides the delivery charge.</p>
          <Btn className="mt-3" disabled={busy} onClick={() => void act(() => post('', { customer: { address: edit.address, city: edit.city, instructions: edit.instructions } }, 'PATCH'), 'Address updated.')}>Save address</Btn>
        </Card>
      )}

      <Card title="History">
        <ol className="space-y-2 text-sm">{o.statusHistory.map((h, idx) => <li key={idx}><span className="font-semibold">{label(h.status)}</span> <span className="text-charcoal-soft">· {new Date(h.at).toLocaleString()}{h.by ? ` · ${h.by}` : ''}{h.note ? ` · ${h.note}` : ''}</span></li>)}</ol>
      </Card>
    </div>
  );
}
