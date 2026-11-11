import { LEGAL_SLUGS, LEGAL_TEMPLATES, LEGAL_TITLES, type LegalSlug } from '../constants/legalTemplates.js';
import { WebsiteSettings } from '../models/misc.model.js';
import { Product } from '../models/catalog.model.js';

export const isLegalSlug = (s: string): s is LegalSlug => (LEGAL_SLUGS as readonly string[]).includes(s);

type Settings = NonNullable<Awaited<ReturnType<typeof load>>>;
const load = () => WebsiteSettings.findOne({ key: 'main' }).lean();
const taka = (n: number) => `৳${n.toLocaleString('en-US')}`;

/** Fills {{tokens}} from the owner's settings. Lines `?token|text` are dropped when the token is empty. */
export function fillTemplate(text: string, values: Record<string, string | undefined>): string {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const cond = /^\?(\w+)\|(.*)$/.exec(line);
    if (cond && !values[cond[1]!]) continue;
    const body = cond ? cond[2]! : line;
    out.push(body.replace(/\{\{(\w+)\}\}/g, (_, k: string) => values[k] ?? ''));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

async function tokens(s: Settings): Promise<Record<string, string | undefined>> {
  const zones = (s.delivery?.zones ?? []).filter((z) => z.active);
  const combo = await Product.findOne({ freeDelivery: true, visibility: 'published', deletedAt: null }, { name: 1 }).lean();
  const days = s.orderSettings?.returnWindowDays;
  const etas = [...new Set(zones.map((z) => z.etaDays).filter(Boolean))];
  return {
    businessName: s.business?.name ?? undefined, phone: s.business?.phone ?? undefined, whatsapp: s.business?.whatsapp ? `+${s.business.whatsapp}` : undefined,
    email: s.business?.email ?? undefined, address: s.business?.address ?? undefined,
    updated: (s.legalUpdatedAt ?? s.updatedAt ?? new Date()).toISOString().slice(0, 10),
    returnWindow: days == null
      ? 'To return an item, please contact us. We will tell you whether it can be accepted and how to send it back.'
      : `You can ask to return an item within **${days} day${days === 1 ? '' : 's'}** of delivery.`,
    deliveryTable: zones.length ? zones.map((z) => `- ${z.name}: ${taka(z.fee)}`).join('\n') : 'Delivery charges are shown at checkout before you pay.',
    comboFree: combo ? `Orders that include **${combo.name}** are delivered free of charge.` : undefined,
    deliveryTime: etas.length ? zones.filter((z) => z.etaDays).map((z) => `- ${z.name}: ${z.etaDays}`).join('\n') : undefined,
  };
}

export async function getLegalPage(slug: LegalSlug) {
  const s = await load();
  if (!s) return null;
  const custom = s.legalPages?.[slug]?.trim();
  const source = custom || LEGAL_TEMPLATES[slug];
  return {
    slug, title: LEGAL_TITLES[slug], markdown: fillTemplate(source, await tokens(s)),
    // true once the owner has confirmed the text; until then the page says it is a draft
    reviewed: Boolean(s.legalReviewed), isTemplate: !custom, updatedAt: s.legalUpdatedAt ?? s.updatedAt,
  };
}

export const legalIndex = async () => {
  const s = await load();
  return LEGAL_SLUGS.map((slug) => ({ slug, title: LEGAL_TITLES[slug], reviewed: Boolean(s?.legalReviewed) }));
};
