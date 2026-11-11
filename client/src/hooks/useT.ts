import { useMemo } from 'react';
import { copy, type Copy, type Lang } from '@/content/copy';
import { ordersCopy, type OrdersCopy } from '@/content/copyOrders';
import { payCopy, type PayCopy } from '@/content/copyPayment';
import { formatTaka } from '@/lib/format';
import type { PublicProduct, PublicSettings } from '@/types/api';
import { featuredOf, useCatalog } from '@/store/catalog';
import { useLangStore } from '@/store/lang';

/** Text tokens such as {combo} are always derived from live server data — never hardcoded. */
export function tokens(lang: Lang, products: PublicProduct[], settings: PublicSettings | null): Record<string, string> {
  const featured = featuredOf(products);
  const zones = settings?.delivery.zones ?? [];
  const fee = (key: string) => { const z = zones.find((x) => x.key === key); return z ? formatTaka(z.fee, lang) : ''; };
  const value = featured?.bundleValue ?? 0;
  return {
    combo: featured ? formatTaka(featured.price, lang) : '',
    value: value ? formatTaka(value, lang) : '',
    save: featured && value > featured.price ? formatTaka(value - featured.price, lang) : '',
    dhaka: fee('inside_rangpur'),
    outside: fee('outside_rangpur'),
  };
}

export function fill(text: string, t: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => t[k] ?? m);
}

export function useT(): { t: Copy; lang: Lang; f: (s: string) => string; money: (n: number) => string } {
  const lang = useLangStore((s) => s.lang);
  const products = useCatalog((s) => s.products);
  const settings = useCatalog((s) => s.settings);
  return useMemo(() => {
    const tk = tokens(lang, products, settings);
    return { t: copy[lang], lang, f: (s: string) => fill(s, tk), money: (n: number) => formatTaka(n, lang) };
  }, [lang, products, settings]);
}

import { checkoutCopy, type CheckoutCopy } from '@/content/copyCheckout';

/** Checkout / order-confirmation copy in the active language. */
export function useCheckoutT(): CheckoutCopy {
  const lang = useLangStore((s) => s.lang);
  return checkoutCopy[lang];
}

/** Payment-method and payment-panel copy in the active language. */
export function usePayT(): PayCopy {
  const lang = useLangStore((s) => s.lang);
  return payCopy[lang];
}

/** Tracking, review and order-action copy in the active language. */
export function useOrdersT(): OrdersCopy {
  const lang = useLangStore((s) => s.lang);
  return ordersCopy[lang];
}
