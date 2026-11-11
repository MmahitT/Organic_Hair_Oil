import type { PublicProduct, PublicSettings } from '@/types/api';
import { absoluteUrl } from './seo';

type Faq = { q: string; a: string };

/** Organization data comes only from what the owner entered in Admin → Website — nothing is invented. */
export function organizationLd(settings: PublicSettings | null) {
  const b = settings?.business;
  if (!b?.name) return null;
  return {
    '@context': 'https://schema.org', '@type': 'Organization', name: b.name, url: absoluteUrl('/'),
    ...(b.logo ? { logo: absoluteUrl(b.logo) } : {}),
    ...(b.email ? { email: b.email } : {}),
    ...(b.phone ? { telephone: b.phone } : {}),
    ...(b.address ? { address: { '@type': 'PostalAddress', streetAddress: b.address, addressCountry: 'BD' } } : {}),
    ...(Object.values(b.social ?? {}).length ? { sameAs: Object.values(b.social ?? {}) } : {}),
  };
}

/**
 * One Product per published product with a BDT offer. `aggregateRating` is added ONLY when the product has real,
 * approved reviews — never a made-up rating.
 */
export function productsLd(products: PublicProduct[], brand: string, lang: 'bn' | 'en') {
  return products.map((p) => {
    const desc = (lang === 'bn' ? p.shortDescriptionBn ?? p.shortDescription : p.shortDescription) ?? p.description ?? undefined;
    const sku = p.variants[0]?.sku;
    return {
      '@context': 'https://schema.org', '@type': 'Product', name: lang === 'bn' ? p.nameBn ?? p.name : p.name,
      ...(p.images[0] ? { image: [absoluteUrl(p.images[0].url)] } : {}), ...(desc ? { description: desc } : {}), ...(sku ? { sku } : {}),
      brand: { '@type': 'Brand', name: brand },
      offers: { '@type': 'Offer', priceCurrency: 'BDT', price: String(p.price), availability: p.stockStatus === 'out_of_stock' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', url: absoluteUrl('/#products') },
      ...((p.ratingCount ?? 0) > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: String(p.ratingAverage), reviewCount: String(p.ratingCount) } } : {}),
    };
  });
}

export function faqLd(items: Faq[]) {
  if (!items.length) return null;
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })) };
}

export function breadcrumbLd(trail: { name: string; path: string }[]) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, item: absoluteUrl(t.path) })) };
}
