import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { consentCopy } from '@/content/copyConsent';
import { useT } from '@/hooks/useT';
import { useCatalog } from '@/store/catalog';
import { useConsent } from '@/store/consent';

/** Does this site use any optional tracking at all? Without tracking IDs there is nothing to ask about. */
export function useHasTrackers() {
  const a = useCatalog((s) => s.settings?.analytics);
  return { any: Boolean(a?.ga4Id || a?.metaPixelId), ga: Boolean(a?.ga4Id), fb: Boolean(a?.metaPixelId) };
}

/**
 * Asks for consent before any optional tracker runs. "Reject all" is as easy as "Accept all". The banner appears only
 * when the owner has configured a tool; the same panel reopens from the footer ("Cookie settings").
 */
export function CookieBanner() {
  const { lang } = useT();
  const c = consentCopy[lang];
  const t = useHasTrackers();
  const { consent, panelOpen, decide, closePanel } = useConsent();
  const [detail, setDetail] = useState(false);
  const [an, setAn] = useState(consent?.analytics ?? false);
  const [mk, setMk] = useState(consent?.marketing ?? false);
  useEffect(() => { if (panelOpen) { setDetail(true); setAn(consent?.analytics ?? false); setMk(consent?.marketing ?? false); } }, [panelOpen, consent]);

  if (!t.any || (consent && !panelOpen)) return null;
  const done = (a: boolean, m: boolean) => { decide({ analytics: t.ga && a, marketing: t.fb && m }); setDetail(false); };

  return (
    <div role="dialog" aria-modal="false" aria-labelledby="cookie-title" className="fixed inset-x-0 bottom-0 z-[70] p-3 sm:p-4">
      <div className="mx-auto max-w-2xl rounded-xl2 border border-sage bg-white p-4 shadow-card sm:p-5">
        <h2 id="cookie-title" className="text-lg font-bold">{c.title}</h2>
        <p className="mt-1 text-sm text-charcoal-soft">{c.text} <Link to="/privacy" className="font-semibold text-forest underline">{c.privacy}</Link></p>
        {detail && (
          <div className="mt-3 space-y-3 text-sm">
            <div className="rounded-lg bg-cream p-3"><p className="font-semibold">{c.necessary}</p><p className="text-charcoal-soft">{c.necessaryText}</p></div>
            {t.ga && <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-sage/60 p-3"><input type="checkbox" className="mt-1 h-5 w-5 accent-forest" checked={an} onChange={(e) => setAn(e.target.checked)} /><span><span className="block font-semibold">{c.analytics}</span><span className="text-charcoal-soft">{c.analyticsText}</span></span></label>}
            {t.fb && <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-sage/60 p-3"><input type="checkbox" className="mt-1 h-5 w-5 accent-forest" checked={mk} onChange={(e) => setMk(e.target.checked)} /><span><span className="block font-semibold">{c.marketing}</span><span className="text-charcoal-soft">{c.marketingText}</span></span></label>}
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {panelOpen && <Button variant="ghost" onClick={closePanel}>{c.close}</Button>}
          {detail ? <Button onClick={() => done(an, mk)}>{c.save}</Button> : <Button variant="outline" onClick={() => setDetail(true)}>{c.customise}</Button>}
          <Button variant="outline" onClick={() => done(false, false)}>{c.reject}</Button>
          {!detail && <Button onClick={() => done(true, true)}>{c.acceptAll}</Button>}
        </div>
      </div>
    </div>
  );
}
