import { MessageCircle, RefreshCw, Star } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink } from '@/components/ui/Button';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { useShop } from '@/hooks/useShop';
import { useOrdersT, useT } from '@/hooks/useT';
import { apiFetch } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import type { PublicReview, ReviewSummary } from '@/types/api';

const Stars = ({ n }: { n: number }) => <span aria-hidden className="flex gap-0.5 text-gold">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={i <= n ? 'h-4 w-4 fill-gold' : 'h-4 w-4'} />)}</span>;

/**
 * Only real reviews from verified buyers, approved by the owner, are shown (Phase 7). With none yet, an honest empty
 * state invites customers instead of inventing testimonials.
 */
export function Reviews() {
  const { t, lang } = useT();
  const o = useOrdersT();
  const { wa, hasWhatsapp } = useShop();
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: PublicReview[]; summary: ReviewSummary }>({ kind: 'loading' });
  const load = useCallback(() => {
    setState((s) => (s.kind === 'ok' ? s : { kind: 'loading' }));
    apiFetch<{ items: PublicReview[]; summary: ReviewSummary }>('/reviews', { query: { limit: 6 } })
      .then((r) => setState({ kind: 'ok', ...r.data })).catch(() => setState((s) => (s.kind === 'ok' ? s : { kind: 'error' })));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <section id="reviews" className="section-pad bg-white">
      <div className="container-page">
        <SectionHeading eyebrow={t.reviews.eyebrow} title={t.reviews.title} />
        {state.kind === 'loading' && <div role="status" aria-label="Loading" className="mx-auto h-40 max-w-xl animate-pulse rounded-xl2 bg-cream" />}
        {state.kind === 'error' && (
          <p role="alert" className="mx-auto max-w-xl text-center text-charcoal-soft">{o.reviews.loadError} <button type="button" onClick={load} className="inline-flex items-center gap-1 font-semibold text-forest underline"><RefreshCw aria-hidden className="h-3.5 w-3.5" />{o.reviews.retry}</button></p>
        )}
        {state.kind === 'ok' && state.items.length > 0 && (
          <Reveal>
            <p className="mb-6 text-center font-semibold text-forest">{o.reviews.summary.replace('{avg}', formatNumber(state.summary.average, lang)).replace('{count}', formatNumber(state.summary.count, lang))}</p>
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {state.items.map((r) => (
                <li key={r.id} className="flex flex-col rounded-xl2 border border-sage/50 bg-cream p-5">
                  <div className="flex items-center justify-between gap-2"><Stars n={r.rating} /><span className="sr-only">{r.rating} / 5</span></div>
                  {r.title && <h3 className="mt-2 text-base font-bold">{r.title}</h3>}
                  <p className="mt-2 flex-1 whitespace-pre-line text-charcoal">{r.comment}</p>
                  <p className="mt-3 text-sm font-semibold">{r.name}{r.verified && <span className="ml-2 text-xs font-normal text-forest">✓ {o.reviews.verified}</span>}</p>
                  {r.reply && <p className="mt-2 rounded-lg bg-white p-3 text-sm"><strong>{o.reviews.reply}:</strong> {r.reply}</p>}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-center"><Link to="/track" className="font-semibold text-forest underline">{o.track.footerLink}</Link></p>
          </Reveal>
        )}
        {state.kind === 'ok' && state.items.length === 0 && (
          <Reveal>
            <div className="mx-auto flex max-w-xl flex-col items-center rounded-xl2 border border-dashed border-sage bg-cream p-8 text-center">
              <div aria-hidden className="mb-3 flex gap-1 text-gold">{[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-6 w-6" />)}</div>
              <h3 className="text-xl font-bold">{t.reviews.emptyTitle}</h3>
              <p className="mt-2 text-charcoal-soft">{t.reviews.emptyText}</p>
              {hasWhatsapp && (
                <ButtonLink className="mt-5" variant="outline" href={wa(t.wa.support)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle aria-hidden className="h-4 w-4" />{t.reviews.cta}
                </ButtonLink>
              )}
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
