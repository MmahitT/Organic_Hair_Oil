import { Star } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { adminFetch, useAdminAuth } from '../auth';
import { Alert, Badge, Btn, Card, Field, Pager, Select, Textarea } from '../ui';

interface Review {
  _id: string; name: string; rating: number; title?: string; comment: string; status: 'pending' | 'approved' | 'rejected'; isFeatured: boolean; isVerifiedPurchase: boolean; adminReply?: string; createdAt: string;
  product?: { name: string } | null; order?: { orderNo: string } | null;
}
const tone = { pending: 'hidden', approved: 'published', rejected: 'out_of_stock' } as const;

export default function ReviewsPage() {
  const canDelete = ['admin', 'superadmin'].includes(useAdminAuth((a) => a.account?.role) ?? '');
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Review[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [reply, setReply] = useState<Record<string, string>>({});
  const limit = 20;

  // Only the newest request may update the screen: a slow earlier response must never overwrite a newer filter's results.
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    setError(null);
    try { const r = await adminFetch<{ items: Review[] }>('/admin/reviews', { query: { page, limit, status } }); if (mine !== seq.current) return; setRows(r.data.items); setTotal(r.meta?.total ?? 0); } catch (e) { setError(e instanceof ApiError ? e.message : 'Failed to load reviews'); }
  }, [page, status]);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setFlash(null);
    try { await fn(); setFlash({ tone: 'success', text: ok }); await load(); } catch (e) { setFlash({ tone: 'error', text: e instanceof ApiError ? e.message : 'Something went wrong' }); }
  };
  const patch = (id: string, body: object, ok: string) => run(() => adminFetch(`/admin/reviews/${id}`, { method: 'PATCH', body }), ok);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div><h1 className="text-3xl font-bold">Reviews</h1><p className="text-sm text-charcoal-soft">Only verified buyers can write reviews. Nothing appears on the site until you approve it.</p></div>
      <Card>
        {flash && <div className="mb-3"><Alert tone={flash.tone}>{flash.text}</Alert></div>}
        <div className="mb-4 max-w-xs"><Select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="pending">Waiting for approval</option><option value="approved">Approved</option><option value="rejected">Rejected</option></Select></div>
        {error && <Alert>{error} <button className="font-semibold underline" onClick={() => void load()}>Retry</button></Alert>}
        {!error && rows === null && <p role="status" className="py-8 text-center text-charcoal-soft">Loading…</p>}
        {rows && rows.length === 0 && <p className="py-8 text-center text-charcoal-soft">No reviews here.</p>}
        <ul className="space-y-4">
          {rows?.map((r) => (
            <li key={r._id} className="rounded-lg border border-sage/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span aria-label={`${r.rating} out of 5`} className="flex gap-0.5 text-gold">{[1, 2, 3, 4, 5].map((i) => <Star key={i} aria-hidden className={i <= r.rating ? 'h-4 w-4 fill-gold' : 'h-4 w-4'} />)}</span>
                <span className="flex items-center gap-2"><Badge kind={tone[r.status]}>{r.status}</Badge>{r.isFeatured && <Badge kind="published">featured</Badge>}</span>
              </div>
              {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
              {/* React escapes the text; the server also strips markup on the way in. */}
              <p className="mt-1 whitespace-pre-wrap">{r.comment}</p>
              <p className="mt-2 text-xs text-charcoal-soft">{r.name} · {r.product?.name ?? 'product'} · order {r.order?.orderNo ?? '—'} · {new Date(r.createdAt).toLocaleDateString()}{r.isVerifiedPurchase ? ' · verified buyer' : ''}</p>
              <Field label="Public reply (optional)" className="mt-3"><Textarea rows={2} maxLength={500} value={reply[r._id] ?? r.adminReply ?? ''} onChange={(e) => setReply({ ...reply, [r._id]: e.target.value })} /></Field>
              <div className="mt-3 flex flex-wrap gap-2">
                {r.status !== 'approved' && <Btn onClick={() => void patch(r._id, { status: 'approved', ...(reply[r._id] !== undefined && { adminReply: reply[r._id] }) }, 'Approved — it is now on the site.')}>Approve</Btn>}
                {r.status !== 'rejected' && <Btn tone="secondary" onClick={() => void patch(r._id, { status: 'rejected' }, 'Rejected.')}>Reject</Btn>}
                {r.status === 'approved' && reply[r._id] !== undefined && <Btn tone="secondary" onClick={() => void patch(r._id, { adminReply: reply[r._id] }, 'Reply saved.')}>Save reply</Btn>}
                {r.status === 'approved' && <Btn tone="ghost" onClick={() => void patch(r._id, { isFeatured: !r.isFeatured }, r.isFeatured ? 'Removed from featured.' : 'Featured — shown first.')}>{r.isFeatured ? 'Unfeature' : 'Feature'}</Btn>}
                {canDelete && <Btn tone="danger" onClick={() => { if (window.confirm('Delete this review permanently?')) void run(() => adminFetch(`/admin/reviews/${r._id}`, { method: 'DELETE' }), 'Deleted.'); }}>Delete</Btn>}
              </div>
            </li>
          ))}
        </ul>
        <Pager page={page} limit={limit} total={total} onPage={setPage} />
      </Card>
    </div>
  );
}
