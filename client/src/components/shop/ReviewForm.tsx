import { Star } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Form';
import { useOrdersT, useT } from '@/hooks/useT';
import { ApiError, apiFetch } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

/** One review for one purchased product. Verified server-side (order number + phone); it appears after approval. */
export function ReviewForm({ orderNo, phone, productId, name }: { orderNo: string; phone: string; productId: string; name: string }) {
  const r = useOrdersT().track.review;
  const { lang } = useT();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [errs, setErrs] = useState<{ rating?: string; comment?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const e: typeof errs = {};
    if (!rating) e.rating = r.ratingNeeded;
    if (comment.trim().length < 5) e.comment = r.commentNeeded;
    setErrs(e);
    if (e.rating || e.comment) return;
    setBusy(true);
    try {
      await apiFetch('/reviews', { method: 'POST', body: { orderNo, phone, productId, rating, comment: comment.trim() } });
      setDone(true);
    } catch (x) {
      if (x instanceof ApiError && x.code === 'REVIEW_EXISTS') setDone(true);
      else setErrs({ form: r.error });
    } finally { setBusy(false); }
  };

  if (done) return <p role="status" className="rounded-lg bg-sage-light p-3 text-sm text-forest"><strong>{name}</strong> — {r.done} {r.pendingNote}</p>;
  // Not a <form>: this sits inside the tracking page and must never submit anything by accident.
  return (
    <div className="space-y-3 rounded-lg border border-sage/60 p-4">
      <p className="font-semibold">{name}</p>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{r.rating}</legend>
        <div className="flex gap-1" role="radiogroup" aria-label={r.rating}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={r.stars.replace('{n}', formatNumber(n, lang))} onClick={() => setRating(n)} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-sage-light">
              <Star aria-hidden className={cn('h-7 w-7', n <= rating ? 'fill-gold text-gold' : 'text-sage')} />
            </button>
          ))}
        </div>
        {errs.rating && <p role="alert" className="mt-1 text-sm text-red-700">{errs.rating}</p>}
      </fieldset>
      <Field label={r.comment} hint={r.commentHint} error={errs.comment}><Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} aria-invalid={!!errs.comment} /></Field>
      {errs.form && <p role="alert" className="text-sm text-red-700">{errs.form}</p>}
      <Button onClick={() => void submit()} disabled={busy}>{busy ? r.sending : r.send}</Button>
    </div>
  );
}
