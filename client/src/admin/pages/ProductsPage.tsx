import { Plus, Search, Star } from 'lucide-react';
import { useCallback, useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { formatTaka } from '@/lib/format';
import { adminFetch } from '../auth';
import { Alert, Badge, Card, Input, Pager, Select } from '../ui';

interface Row {
  _id: string; name: string; slug: string; type: 'simple' | 'bundle'; visibility: string; isFeatured: boolean;
  images: { url: string; alt: string }[]; variants: { sku: string; regularPrice: number; discountPrice?: number | null; stock: number }[];
}

export default function ProductsPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [visibility, setVisibility] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[] | null>(null);
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
      const r = await adminFetch<{ items: Row[] }>('/admin/products', { query: { page, limit, q: debounced, visibility } });
      if (mine !== seq.current) return;
      setRows(r.data.items); setTotal(r.meta?.total ?? 0);
    } catch (e) { if (mine === seq.current) setError(e instanceof ApiError ? e.message : 'Failed to load products'); }
  }, [page, debounced, visibility]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Products</h1>
        <Link to="/admin/products/new" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-forest px-4 text-sm font-semibold text-white hover:bg-forest-700"><Plus aria-hidden className="h-4 w-4" />New product</Link>
      </div>
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px]">
          <div className="relative"><Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-soft" /><Input aria-label="Search products" placeholder="Search name, slug or SKU" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select aria-label="Filter by visibility" value={visibility} onChange={(e) => { setVisibility(e.target.value); setPage(1); }}>
            <option value="">All visibility</option><option value="published">Published</option><option value="draft">Draft</option><option value="hidden">Hidden</option>
          </Select>
        </div>
        {error && <Alert>{error} <button className="font-semibold underline" onClick={() => void load()}>Retry</button></Alert>}
        {!error && rows === null && <p role="status" className="py-8 text-center text-charcoal-soft">Loading…</p>}
        {rows && rows.length === 0 && <p className="py-8 text-center text-charcoal-soft">No products found.</p>}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead><tr className="border-b border-sage/50 text-xs uppercase tracking-wide text-charcoal-soft"><th className="py-2 pr-3">Product</th><th className="px-3">SKU</th><th className="px-3">Price</th><th className="px-3">Stock</th><th className="px-3">Status</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const v = r.variants[0];
                  const stock = r.type === 'bundle' ? null : r.variants.reduce((s, x) => s + x.stock, 0);
                  return (
                    <tr key={r._id} className="border-b border-sage/30 last:border-0">
                      <td className="py-3 pr-3">
                        <Link to={`/admin/products/${r._id}`} className="flex items-center gap-3 font-semibold text-forest hover:underline">
                          <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-cream-dark">{r.images[0] && <img src={r.images[0].url} alt="" className="h-full w-full object-contain" />}</span>
                          <span>{r.name}{r.isFeatured && <Star aria-label="Featured" className="ml-1 inline h-3.5 w-3.5 fill-gold text-gold" />}<span className="block text-xs font-normal text-charcoal-soft">{r.type === 'bundle' ? 'Bundle' : 'Simple'} · /{r.slug}</span></span>
                        </Link>
                      </td>
                      <td className="px-3 text-charcoal-soft">{r.variants.map((x) => x.sku).join(', ')}</td>
                      <td className="px-3">{v ? (v.discountPrice ? <><span className="font-semibold">{formatTaka(v.discountPrice, 'en')}</span> <s className="text-charcoal-soft">{formatTaka(v.regularPrice, 'en')}</s></> : formatTaka(v.regularPrice, 'en')) : '—'}</td>
                      <td className="px-3">{stock === null ? <span className="text-charcoal-soft">from parts</span> : stock}</td>
                      <td className="px-3"><Badge kind={r.visibility}>{r.visibility}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} limit={limit} total={total} onPage={setPage} />
      </Card>
    </div>
  );
}
