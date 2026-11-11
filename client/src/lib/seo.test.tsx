import { describe, expect, it } from 'vitest';
import type { PublicProduct, PublicSettings } from '@/types/api';
import { absoluteUrl, jsonLdString } from './seo';
import { breadcrumbLd, faqLd, organizationLd, productsLd } from './structuredData';

const product = (over: Partial<PublicProduct> = {}): PublicProduct => ({
  id: 'p1', slug: 'hair-oil', type: 'simple', name: 'Hair Oil', nameBn: 'হেয়ার অয়েল', shortDescription: 'A light hair oil.', shortDescriptionBn: null, description: null, descriptionBn: null,
  images: [{ url: '/images/hair-oil-bottle.webp', alt: 'Hair oil', isPrimary: true }], variants: [{ sku: 'HO-OIL-200', price: 550 } as never], price: 550, compareAtPrice: null, stockStatus: 'in_stock', maxQty: 10,
  freeDelivery: false, isFeatured: false, bundle: [], bundleValue: null, ingredients: [], ...over,
});

interface ProductLd { name: string; image: string[]; offers: { availability: string; price: string; priceCurrency: string }; aggregateRating?: unknown }
interface Listed { mainEntity: unknown[]; itemListElement: { position: number }[] }
const asProduct = (x: unknown) => x as ProductLd;

describe('structured data', () => {
  it('describes each product with a BDT offer and absolute image address', () => {
    const p = asProduct(productsLd([product()], 'Beauty Organic Hair Oil', 'en')[0]);
    expect(p).toMatchObject({ '@type': 'Product', name: 'Hair Oil', sku: 'HO-OIL-200', brand: { name: 'Beauty Organic Hair Oil' }, offers: { priceCurrency: 'BDT', price: '550', availability: 'https://schema.org/InStock' } });
    expect(p.image[0]).toMatch(/^https?:\/\/.+\/images\/hair-oil-bottle\.webp$/);
    expect(p.offers.availability).toBe('https://schema.org/InStock');
  });
  it('adds a rating ONLY from real approved reviews — never an invented one', () => {
    const none = asProduct(productsLd([product()], 'B', 'en')[0]);
    expect(none).not.toHaveProperty('aggregateRating');
    expect(productsLd([product({ ratingCount: 0, ratingAverage: 0 })], 'B', 'en')[0]).not.toHaveProperty('aggregateRating');
    const some = asProduct(productsLd([product({ ratingCount: 3, ratingAverage: 4.7 })], 'B', 'en')[0]);
    expect(some.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: '4.7', reviewCount: '3' });
  });
  it('marks sold-out products as out of stock and uses the Bangla name for Bangla visitors', () => {
    const p = asProduct(productsLd([product({ stockStatus: 'out_of_stock' })], 'B', 'bn')[0]);
    expect(p.offers.availability).toBe('https://schema.org/OutOfStock');
    expect(p.name).toBe('হেয়ার অয়েল');
  });
  it('builds Organization only from what the owner entered, plus FAQ and breadcrumbs', () => {
    const settings = { currency: 'BDT', business: { name: 'Shop', logo: null, email: 'a@b.com', phone: '0171', address: '12 Road', social: { facebook: 'https://facebook.com/x' } }, announcement: null, delivery: { zones: [] }, payments: { cod: true, manual: [], bank: null } } as PublicSettings;
    expect(organizationLd(settings)).toMatchObject({ '@type': 'Organization', name: 'Shop', email: 'a@b.com', telephone: '0171', sameAs: ['https://facebook.com/x'], address: { streetAddress: '12 Road', addressCountry: 'BD' } });
    expect(organizationLd({ ...settings, business: { name: 'Shop', logo: null } })).not.toHaveProperty('email');
    expect(organizationLd(null)).toBeNull();
    expect(faqLd([])).toBeNull();
    expect((faqLd([{ q: 'Q?', a: 'A.' }]) as unknown as Listed).mainEntity[0]).toMatchObject({ '@type': 'Question', name: 'Q?', acceptedAnswer: { text: 'A.' } });
    expect((breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Privacy', path: '/privacy' }]) as unknown as Listed).itemListElement.map((i) => i.position)).toEqual([1, 2]);
  });
  it('escapes "<" so data can never close the script tag', () => {
    expect(jsonLdString({ a: '</script><img onerror=1>' })).not.toContain('</script>');
    expect(JSON.parse(jsonLdString({ a: '</script>' }))).toEqual({ a: '</script>' }); // still valid JSON with the same value
    expect(absoluteUrl('https://x.com/a')).toBe('https://x.com/a');
    expect(absoluteUrl('/a')).toMatch(/\/a$/);
  });
});
