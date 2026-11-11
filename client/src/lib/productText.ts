import type { Lang } from '@/content/copy';
import type { PublicProduct } from '@/types/api';

export const pName = (p: Pick<PublicProduct, 'name' | 'nameBn'>, lang: Lang) => (lang === 'bn' && p.nameBn ? p.nameBn : p.name);
export const pShort = (p: PublicProduct, lang: Lang) => (lang === 'bn' && p.shortDescriptionBn ? p.shortDescriptionBn : p.shortDescription) ?? '';
export const bundleName = (b: PublicProduct['bundle'][number], lang: Lang) => (lang === 'bn' && b.nameBn ? b.nameBn : b.name);

/** Stable "Hair Oil · 200 ml" style size line for a simple product, or the component list for a bundle. */
export function pSizeLine(p: PublicProduct, lang: Lang): string {
  if (p.type === 'bundle') return p.bundle.map((b) => `${bundleName(b, lang)}${b.label && b.label !== 'Standard' ? ` ${b.label}` : ''}`).join(' · ');
  return p.variants[0]?.label ?? '';
}
