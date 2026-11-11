import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applyConsent, pageView, track } from '@/lib/analytics';
import { useCatalog } from '@/store/catalog';
import { useConsent } from '@/store/consent';

/**
 * Starts tracking only for tools the owner configured AND the visitor accepted; reports page views as the visitor
 * moves around; and turns every click on a WhatsApp link into a "lead" event.
 */
export function useAnalytics(): void {
  const { pathname } = useLocation();
  const load = useCatalog((s) => s.load);
  const ids = useCatalog((s) => s.settings?.analytics);
  const consent = useConsent((s) => s.consent);
  const ga = ids?.ga4Id ?? null;
  const fb = ids?.metaPixelId ?? null;

  useEffect(() => { void load(); }, [load]); // settings (tracking IDs) are needed on every page, not just the landing page
  useEffect(() => { applyConsent({ ga4Id: ga, metaPixelId: fb }, consent); }, [ga, fb, consent]);
  useEffect(() => { if (!pathname.startsWith('/admin')) pageView(pathname); }, [pathname, ga, fb, consent]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a');
      const href = a?.getAttribute('href') ?? '';
      if (/^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(href)) track('generate_lead');
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
}
