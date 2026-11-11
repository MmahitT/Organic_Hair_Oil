import { copy, type Lang } from '@/content/copy';
import { formatTaka } from '@/lib/format';
import { pName } from '@/lib/productText';
import type { ResolvedLine, Totals, Zone } from '@/lib/pricing';

/** number must be international digits without "+" (e.g. 8801857164863). */
export function whatsappUrl(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function orderMessage(resolved: ResolvedLine[], zone: Zone | undefined, totals: Totals, lang: Lang): string {
  const c = copy[lang];
  const rows = resolved
    .filter((r) => !r.unavailable)
    .map((r) => `• ${pName(r.product, lang)} × ${r.qty} = ${formatTaka(r.lineTotal, lang)}`);
  return [
    c.wa.orderIntro,
    ...rows,
    `${c.cart.delivery}: ${totals.deliveryFee === 0 ? c.cart.free : formatTaka(totals.deliveryFee, lang)}`,
    `${c.cart.total}: ${formatTaka(totals.total, lang)}`,
    ...(zone ? [`${c.wa.area}: ${zone.name}`] : []),
  ].join('\n');
}
