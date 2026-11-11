import type { Lang } from '@/content/copy';

/** Formats whole-taka amounts, e.g. ৳999 (Bangla digits when lang = bn). */
export function formatTaka(amount: number, lang: Lang): string {
  const n = new Intl.NumberFormat(lang === 'bn' ? 'bn-BD' : 'en-BD', {
    maximumFractionDigits: 0,
  }).format(amount);
  return `৳${n}`;
}

export function formatNumber(n: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'bn' ? 'bn-BD' : 'en-US').format(n);
}
