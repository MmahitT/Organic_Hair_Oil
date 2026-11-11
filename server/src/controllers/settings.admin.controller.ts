import type { Request, Response } from 'express';
import { Errors } from '../middleware/errorHandler.js';
import { WebsiteSettings } from '../models/misc.model.js';
import { LEGAL_SLUGS, LEGAL_TEMPLATES } from '../constants/legalTemplates.js';
import { audit } from '../services/audit.service.js';

const faqOf = (s: { content?: unknown } | null) => ((s?.content as { faq?: unknown[] } | undefined)?.faq ?? []) as { q: string; a: string; qBn?: string; aBn?: string }[];

/** Everything the owner edits on the "Website" admin screens (payments have their own endpoint). */
export async function getSettings(_req: Request, res: Response) {
  const s = await WebsiteSettings.findOne({ key: 'main' }).lean();
  if (!s) throw Errors.notFound('Settings not configured');
  res.json({
    success: true,
    data: {
      business: { name: s.business?.name ?? '', legalName: s.business?.legalName ?? '', phone: s.business?.phone ?? '', whatsapp: s.business?.whatsapp ?? '', email: s.business?.email ?? '', address: s.business?.address ?? '', social: { facebook: s.business?.social?.facebook ?? '', instagram: s.business?.social?.instagram ?? '', youtube: s.business?.social?.youtube ?? '', tiktok: s.business?.social?.tiktok ?? '' } },
      delivery: { defaultZoneKey: s.delivery?.defaultZoneKey ?? '', zones: (s.delivery?.zones ?? []).map((z) => ({ key: z.key, name: z.name, fee: z.fee, etaDays: z.etaDays ?? '', active: z.active, districts: z.districts })) },
      seo: { title: s.seo?.title ?? '', description: s.seo?.description ?? '', titleBn: s.seo?.titleBn ?? '', descriptionBn: s.seo?.descriptionBn ?? '', ogImage: s.seo?.ogImage ?? '', ga4Id: s.analytics?.ga4Id ?? '', metaPixelId: s.analytics?.metaPixelId ?? '' },
      legal: { privacy: s.legalPages?.privacy ?? '', terms: s.legalPages?.terms ?? '', refund: s.legalPages?.refund ?? '', shipping: s.legalPages?.shipping ?? '', reviewed: Boolean(s.legalReviewed), templates: Object.fromEntries(LEGAL_SLUGS.map((k) => [k, LEGAL_TEMPLATES[k]])) },
      content: { announcement: { text: s.announcement?.text ?? '', textBn: s.announcement?.textBn ?? '', link: s.announcement?.link ?? '', active: s.announcement?.active ?? false, expiresAt: s.announcement?.expiresAt ?? null }, faq: faqOf(s) },
    },
  });
}

type Flat = Record<string, unknown>;

export async function putSection(req: Request, res: Response) {
  const section = req.params['section'] as 'business' | 'delivery' | 'content' | 'seo' | 'legal';
  const b = req.body as Flat & { zones?: unknown[]; defaultZoneKey?: string; announcement?: Flat; faq?: unknown[]; social?: Flat };
  const set: Flat = {};
  if (section === 'business') {
    for (const k of ['name', 'legalName', 'phone', 'whatsapp', 'email', 'address'] as const) set[`business.${k}`] = b[k] ?? null;
    for (const k of ['facebook', 'instagram', 'youtube', 'tiktok'] as const) set[`business.social.${k}`] = (b.social as Flat | undefined)?.[k] ?? null;
  } else if (section === 'seo') {
    for (const k of ['title', 'description', 'titleBn', 'descriptionBn', 'ogImage'] as const) set[`seo.${k}`] = b[k] ?? null;
    for (const k of ['ga4Id', 'metaPixelId'] as const) set[`analytics.${k}`] = b[k] ?? null;
  } else if (section === 'legal') {
    for (const k of LEGAL_SLUGS) set[`legalPages.${k}`] = (b[k] as string | undefined)?.trim() || null;
    set['legalReviewed'] = b['reviewed'];
    set['legalUpdatedAt'] = new Date();
  } else if (section === 'delivery') {
    set['delivery.zones'] = b.zones;
    set['delivery.defaultZoneKey'] = b.defaultZoneKey;
  } else {
    if (b.announcement) for (const [k, v] of Object.entries({ text: undefined, textBn: undefined, link: undefined, expiresAt: null, ...b.announcement })) set[`announcement.${k}`] = v ?? null;
    if (b.faq) set['content.faq'] = b.faq;
  }
  const before = await WebsiteSettings.findOne({ key: 'main' }).lean();
  if (!before) throw Errors.notFound('Settings not configured');
  await WebsiteSettings.updateOne({ key: 'main' }, { $set: set });
  const pick = (s: typeof before) => (section === 'business' ? s.business : section === 'delivery' ? s.delivery : section === 'seo' ? { seo: s.seo, analytics: s.analytics } : section === 'legal' ? { reviewed: s.legalReviewed, lengths: Object.fromEntries(LEGAL_SLUGS.map((k) => [k, s.legalPages?.[k]?.length ?? 0])) } : { announcement: s.announcement, faqCount: faqOf(s).length });
  const after = await WebsiteSettings.findOne({ key: 'main' }).lean();
  await audit({ req, action: `settings.${section}.update`, entityType: 'WebsiteSettings', entityId: 'main', before: pick(before), after: pick(after!) });
  return getSettings(req, res);
}
