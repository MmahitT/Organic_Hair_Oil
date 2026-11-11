import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { adminFetch, downloadFile, useAdminAuth } from '../auth';
import { Alert, Badge, Btn, Card, Field, Input, Pager, Select } from '../ui';

interface Item { productId: string; productName: string; sku: string; label: string; stock: number; reserved: number; available: number; status: string; visibility: string; isActive: boolean }
interface Move { _id: string; sku: string; delta: number; reason: string; by?: string; note?: string; createdAt: string }

function AdjustPanel({ item, onDone, onCancel }: { item: Item; onDone: (msg: string) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<'add' | 'remove' | 'set'>('add');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || value === '') return setError('Enter a whole number (0 or more).');
    if (mode !== 'set' && n === 0) return setError('Enter a quantity above 0.');
    if (note.trim().length < 3) return setError('Please give a short reason (e.g. "new batch", "damaged").');
    setBusy(true);
    try {
      const body = mode === 'set' ? { set: n, note } : { delta: mode === 'add' ? n : -n, note };
      const r = await adminFetch<{ before: number; after: number }>(`/admin/inventory/${item.productId}/${item.sku}`, { method: 'PATCH', body });
      onDone(`${item.productName} (${item.sku}): ${r.data.before} → ${r.data.after}`);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Failed to adjust stock'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-3 rounded-lg border border-sage bg-cream p-4">
      <p className="mb-3 text-sm font-semibold">Adjust stock — {item.productName} <span className="font-normal text-charcoal-soft">({item.sku}, now {item.stock})</span></p>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Action"><Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="add">Add stock</option><option value="remove">Remove stock</option><option value="set">Set exact count</option></Select></Field>
        <Field label={mode === 'set' ? 'New stock count' : 'Quantity'}><Input type="number" inputMode="numeric" min={0} step={1} value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        <Field label="Reason"><Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. new batch received" /></Field>
      </div>
      <div className="mt-3 flex gap-2"><Btn onClick={() => void submit()} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn><Btn tone="ghost" onClick={onCancel}>Cancel</Btn></div>
    </div>
  );
}

export default function InventoryPage() {
  const role = useAdminAuth((a) => a.account?.role);
  const canExport = role === 'admin' || role === 'superadmin'; // stock sheets are for owners/admins; staff work in the table
  const [items, setItems] = useState<Item[] | null>(null);
  const [moves, setMoves] = useState<Move[] | null>(null);
  const [mTotal, setMTotal] = useState(0);
  const [mPage, setMPage] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const limit = 15;

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        adminFetch<{ items: Item[] }>('/admin/inventory'),
        adminFetch<{ items: Move[] }>('/admin/inventory/movements', { query: { page: mPage, limit } }),
      ]);
      setItems(a.data.items); setMoves(b.data.items); setMTotal(b.meta?.total ?? 0); setError(null);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Failed to load inventory'); }
  }, [mPage]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-3xl font-bold">Inventory</h1>
      <p className="text-sm text-charcoal-soft">Bundles (like the combo) have no stock of their own — their availability comes from their parts.</p>
      {flash && <Alert tone="success">Stock updated: {flash}</Alert>}
      {error && <Alert>{error}</Alert>}
      <Card title="Stock levels" actions={canExport ? <Btn tone="secondary" className="min-h-9 px-3" onClick={() => void downloadFile('/admin/inventory/export', 'inventory.csv').catch(() => undefined)}>Export CSV</Btn> : undefined}>
        {items === null && !error && <p role="status" className="py-6 text-center text-charcoal-soft">Loading…</p>}
        {items && items.length === 0 && <p className="py-6 text-center text-charcoal-soft">No stock-tracked products yet.</p>}
        {items && items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead><tr className="border-b border-sage/50 text-xs uppercase tracking-wide text-charcoal-soft"><th className="py-2 pr-3">Product</th><th className="px-3">SKU</th><th className="px-3">In stock</th><th className="px-3">Reserved</th><th className="px-3">Status</th><th /></tr></thead>
              <tbody>
                {items.map((i) => {
                  const key = `${i.productId}:${i.sku}`;
                  return (
                    <tr key={key} className="border-b border-sage/30 align-top last:border-0">
                      <td className="py-3 pr-3 font-semibold">{i.productName}<span className="block text-xs font-normal text-charcoal-soft">{i.label} · {i.visibility}</span></td>
                      <td className="px-3 py-3 text-charcoal-soft">{i.sku}</td>
                      <td className="px-3 py-3 text-lg font-bold">{i.stock}</td>
                      <td className="px-3 py-3">{i.reserved}</td>
                      <td className="px-3 py-3"><Badge kind={i.status}>{i.status.replace(/_/g, ' ')}</Badge></td>
                      <td className="py-2 text-right"><Btn tone="secondary" onClick={() => { setFlash(null); setEditing(editing === key ? null : key); }}>Adjust</Btn></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {editing && items.filter((i) => `${i.productId}:${i.sku}` === editing).map((i) => (
              <AdjustPanel key={editing} item={i} onCancel={() => setEditing(null)} onDone={(m) => { setEditing(null); setFlash(m); void load(); }} />
            ))}
          </div>
        )}
      </Card>
      <Card title="History">
        {moves && moves.length === 0 && <p className="py-4 text-center text-charcoal-soft">No stock movements yet.</p>}
        {moves && moves.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead><tr className="border-b border-sage/50 text-xs uppercase tracking-wide text-charcoal-soft"><th className="py-2 pr-3">When</th><th className="px-3">SKU</th><th className="px-3">Change</th><th className="px-3">Reason</th></tr></thead>
              <tbody>{moves.map((m) => (
                <tr key={m._id} className="border-b border-sage/30 last:border-0">
                  <td className="py-2 pr-3 text-charcoal-soft">{new Date(m.createdAt).toLocaleString()}</td><td className="px-3">{m.sku}</td>
                  <td className={`px-3 font-semibold ${m.delta < 0 ? 'text-danger' : 'text-forest'}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td><td className="px-3">{m.note ?? m.reason}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
        <Pager page={mPage} limit={limit} total={mTotal} onPage={setMPage} />
      </Card>
    </div>
  );
}
