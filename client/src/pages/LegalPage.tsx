import { AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckoutHeader } from '@/components/shop/CheckoutHeader';
import { Button } from '@/components/ui/Button';
import { useT } from '@/hooks/useT';
import { apiFetch } from '@/lib/api';
import { Markdown } from '@/lib/markdown';
import { Seo } from '@/lib/seo';
import { breadcrumbLd } from '@/lib/structuredData';

export type LegalSlug = 'privacy' | 'terms' | 'refund' | 'shipping';
/** Public address of each policy. */
export const LEGAL_PATHS: Record<LegalSlug, string> = { privacy: '/privacy', terms: '/terms', refund: '/returns', shipping: '/shipping' };

interface Page { slug: LegalSlug; title: string; markdown: string; reviewed: boolean; isTemplate: boolean }
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; page: Page };

const COPY = {
  en: { back: '← Back to shop', draftTitle: 'Draft policy', draft: 'This page is a draft template and has not yet been reviewed by the shop owner. Details may change.', retry: 'Try again', errTitle: 'We could not load this page', errText: 'Please check your connection and try again.', loading: 'Loading…', home: 'Home', english: 'This policy is shown in English.' },
  bn: { back: '← দোকানে ফিরুন', draftTitle: 'খসড়া নীতিমালা', draft: 'এই পেজটি একটি খসড়া টেমপ্লেট; দোকানের মালিক এখনও এটি পর্যালোচনা করেননি। তথ্য পরিবর্তন হতে পারে।', retry: 'আবার চেষ্টা করুন', errTitle: 'পেজটি লোড করা যায়নি', errText: 'ইন্টারনেট দেখে আবার চেষ্টা করুন।', loading: 'লোড হচ্ছে…', home: 'হোম', english: 'এই নীতিমালা ইংরেজিতে দেখানো হচ্ছে।' },
};

export default function LegalPage({ slug }: { slug: LegalSlug }) {
  const { lang } = useT();
  const c = COPY[lang];
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try { setState({ kind: 'ok', page: (await apiFetch<Page>(`/legal/${slug}`)).data }); } catch { setState({ kind: 'error' }); }
  }, [slug]);
  useEffect(() => { void load(); window.scrollTo({ top: 0 }); }, [load]);

  const title = state.kind === 'ok' ? state.page.title : slug;
  return (
    <>
      <Seo title={`${title} — Beauty Organic Hair Oil`} description={state.kind === 'ok' ? state.page.markdown.replace(/[#*\-\n]+/g, ' ').trim().slice(0, 150) : undefined} path={LEGAL_PATHS[slug]} jsonLd={[breadcrumbLd([{ name: c.home, path: '/' }, { name: title, path: LEGAL_PATHS[slug] }])]} lang={lang} />
      <CheckoutHeader title={title} />
      <main className="container-page max-w-3xl py-8 sm:py-12">
        {state.kind === 'loading' && <p role="status" className="py-16 text-center text-charcoal-soft">{c.loading}</p>}
        {state.kind === 'error' && (
          <div role="alert" className="rounded-xl2 bg-white p-8 text-center shadow-card"><h1 className="text-2xl font-bold">{c.errTitle}</h1><p className="mt-2 text-charcoal-soft">{c.errText}</p><Button className="mt-5" onClick={() => void load()}>{c.retry}</Button></div>
        )}
        {state.kind === 'ok' && (
          <article className="rounded-xl2 bg-white p-5 shadow-card sm:p-8">
            {!state.page.reviewed && <p role="note" className="mb-4 flex items-start gap-2 rounded-lg border border-gold/50 bg-gold/10 p-3 text-sm"><AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>{c.draftTitle}.</strong> {c.draft}</span></p>}
            {lang === 'bn' && <p className="mb-2 text-xs text-charcoal-soft">{c.english}</p>}
            <Markdown source={state.page.markdown} />
          </article>
        )}
        <p className="mt-6 text-center"><Link to="/" className="font-semibold text-forest hover:underline">{c.back}</Link></p>
      </main>
    </>
  );
}
