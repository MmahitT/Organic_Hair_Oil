import { useMemo } from 'react';
import { featuredOf, useCatalog } from '@/store/catalog';
import { whatsappUrl } from '@/lib/whatsapp';

/** Live catalogue + business settings (all server-owned) with convenient derived values. */
export function useShop() {
  const status = useCatalog((s) => s.status);
  const products = useCatalog((s) => s.products);
  const settings = useCatalog((s) => s.settings);
  return useMemo(() => {
    const featured = featuredOf(products);
    const zones = settings?.delivery.zones ?? [];
    const whatsapp = settings?.business.whatsapp ?? '';
    return {
      status, products, settings, featured, zones,
      phone: settings?.business.phone ?? '',
      businessName: settings?.business.name ?? 'Beauty Organic Hair Oil',
      wa: (text: string) => whatsappUrl(whatsapp, text),
      hasWhatsapp: Boolean(whatsapp),
    };
  }, [status, products, settings]);
}
