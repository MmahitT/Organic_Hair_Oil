import { useState } from 'react';
import { adminFetch } from '../auth';
import { errMsg, useLoad } from '../hooks';
import { Alert, Badge, Btn, Card, Pager, Select } from '../ui';

interface Msg { _id: string; name: string; phone?: string; email?: string; message: string; status: 'new' | 'read' | 'done'; createdAt: string }
const tone = { new: 'hidden', read: 'draft', done: 'published' } as const;

export default function MessagesPage() {
  const [status, setStatus] = useState('new');
  const [page, setPage] = useState(1);
  const [flash, setFlash] = useState<string | null>(null);
  const limit = 20;
  const { data, error, reload } = useLoad(async () => { const r = await adminFetch<{ items: Msg[] }>('/admin/messages', { query: { page, limit, status } }); return { items: r.data.items, total: r.meta?.total ?? 0 }; }, `${page}|${status}`);

  const mark = async (id: string, next: Msg['status']) => {
    setFlash(null);
    try { await adminFetch(`/admin/messages/${id}`, { method: 'PATCH', body: { status: next } }); await reload(); } catch (e) { setFlash(errMsg(e, 'Could not update')); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div><h1 className="text-3xl font-bold">Messages</h1><p className="text-sm text-charcoal-soft">Sent from the Contact page. Reply by phone or WhatsApp, then mark them done.</p></div>
      <Card>
        {flash && <div className="mb-3"><Alert>{flash}</Alert></div>}
        <div className="mb-4 max-w-xs"><Select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="new">New</option><option value="read">Read</option><option value="done">Done</option><option value="">All</option></Select></div>
        {error && <Alert>{error} <button className="font-semibold underline" onClick={() => void reload()}>Retry</button></Alert>}
        {!error && !data && <p role="status" className="py-8 text-center text-charcoal-soft">Loading…</p>}
        {data && data.items.length === 0 && <p className="py-8 text-center text-charcoal-soft">No messages here.</p>}
        <ul className="space-y-4">
          {data?.items.map((x) => (
            <li key={x._id} className="rounded-lg border border-sage/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{x.name}</p><span className="flex items-center gap-2 text-xs text-charcoal-soft">{new Date(x.createdAt).toLocaleString()}<Badge kind={tone[x.status]}>{x.status}</Badge></span></div>
              <p className="mt-1 text-sm">{x.phone && <><a href={`tel:${x.phone}`} className="text-forest hover:underline">{x.phone}</a> · <a href={`https://wa.me/88${x.phone}`} target="_blank" rel="noreferrer" className="text-forest hover:underline">WhatsApp</a></>}{x.phone && x.email ? ' · ' : ''}{x.email && <a href={`mailto:${x.email}`} className="text-forest hover:underline">{x.email}</a>}</p>
              {/* React escapes the text, so a malicious message cannot inject markup. */}
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-cream p-3 text-sm">{x.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {x.status === 'new' && <Btn tone="secondary" onClick={() => void mark(x._id, 'read')}>Mark read</Btn>}
                {x.status !== 'done' && <Btn onClick={() => void mark(x._id, 'done')}>Mark done</Btn>}
                {x.status === 'done' && <Btn tone="ghost" onClick={() => void mark(x._id, 'new')}>Re-open</Btn>}
              </div>
            </li>
          ))}
        </ul>
        <Pager page={page} limit={limit} total={data?.total ?? 0} onPage={setPage} />
      </Card>
    </div>
  );
}
