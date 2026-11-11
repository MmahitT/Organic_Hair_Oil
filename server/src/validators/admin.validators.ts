import { z } from 'zod';
import { DISTRICTS } from '../constants/districts.js';
import { phoneSchema } from './auth.validators.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');
const url = (n = 300) => z.string().trim().max(n).url().refine((u) => u.startsWith('https://'), 'Use an https:// address');
const blankToUndef = <T extends z.ZodTypeAny>(s: T) => z.union([z.literal('').transform(() => undefined), s]).optional();

/* ---- customers ---- */
export const customersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(80).optional(),
  sort: z.enum(['recent', 'spent', 'orders']).default('recent'),
  blocked: z.enum(['true', 'false']).optional(),
});
export const customerParam = z.object({ phone: phoneSchema });
export const customerPatch = z.object({ notes: z.string().trim().max(1000).optional(), isBlocked: z.boolean().optional() }).strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

/* ---- contact messages ---- */
export const contactBody = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(80),
  phone: blankToUndef(phoneSchema),
  email: blankToUndef(z.string().trim().toLowerCase().email().max(254)),
  message: z.string().trim().min(5, 'Please write a few words').max(1500),
  website: z.string().max(200).optional(), // honeypot: real people never fill this
}).refine((v) => v.phone || v.email, { message: 'Add a phone number or an email so we can reply', path: ['phone'] });
export const messagesQuery = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), status: z.enum(['new', 'read', 'done']).optional() });
export const messagePatch = z.object({ status: z.enum(['new', 'read', 'done']) });
export { objectId };

/* ---- settings sections ---- */
export const businessSection = z.object({
  name: z.string().trim().min(2).max(80),
  legalName: z.string().trim().max(120).optional().transform((v) => v || undefined),
  phone: z.string().trim().max(20).regex(/^[0-9+\-\s]*$/, 'Digits only').optional().transform((v) => v || undefined),
  whatsapp: z.union([z.literal(''), z.string().trim().regex(/^8801[3-9]\d{8}$/, 'Use the international form, e.g. 8801XXXXXXXXX')]).optional().transform((v) => v || undefined),
  email: blankToUndef(z.string().trim().toLowerCase().email().max(254)),
  address: z.string().trim().max(200).optional().transform((v) => v || undefined),
  social: z.object({ facebook: blankToUndef(url()), instagram: blankToUndef(url()), youtube: blankToUndef(url()), tiktok: blankToUndef(url()) }).strict().optional(),
}).strict();

const zone = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,40}$/, 'Zone key: letters, digits, underscores'),
  name: z.string().trim().min(2).max(60),
  fee: z.number().int().min(0).max(5000),
  etaDays: z.string().trim().max(30).optional().transform((v) => v || undefined),
  active: z.boolean(),
  districts: z.array(z.enum(DISTRICTS)).max(64),
}).strict();
export const deliverySection = z.object({ zones: z.array(zone).min(1).max(10), defaultZoneKey: z.string().trim() }).strict().superRefine((v, ctx) => {
  const keys = v.zones.map((z) => z.key);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: 'Two zones share the same key', path: ['zones'] });
  const seen = new Set<string>();
  for (const z of v.zones) for (const d of z.districts) { if (seen.has(d)) ctx.addIssue({ code: 'custom', message: `${d} is in more than one zone`, path: ['zones'] }); seen.add(d); }
  const def = v.zones.find((z) => z.key === v.defaultZoneKey);
  if (!def) ctx.addIssue({ code: 'custom', message: 'The default zone must be one of the zones', path: ['defaultZoneKey'] });
  else if (!def.active) ctx.addIssue({ code: 'custom', message: 'The default zone must be active', path: ['defaultZoneKey'] });
});

export const contentSection = z.object({
  announcement: z.object({
    text: z.string().trim().max(200).optional().transform((v) => v || undefined),
    textBn: z.string().trim().max(200).optional().transform((v) => v || undefined),
    link: z.union([z.literal(''), z.string().trim().max(200).regex(/^(#[\w-]+|\/[\w\-/#?=&]*|https:\/\/[^\s]+)$/, 'Use #section, /page or an https:// address')]).optional().transform((v) => v || undefined),
    active: z.boolean(),
    expiresAt: z.union([z.literal('').transform(() => null), z.coerce.date()]).nullable().optional(),
  }).strict().optional(),
  faq: z.array(z.object({
    q: z.string().trim().min(3).max(200), a: z.string().trim().min(3).max(1000),
    qBn: z.string().trim().max(200).optional().transform((v) => v || undefined), aBn: z.string().trim().max(1000).optional().transform((v) => v || undefined),
  }).strict()).max(20).optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
const imagePath = z.union([z.literal(''), z.string().trim().max(300).refine((u) => u.startsWith('https://') || /^\/[\w\-./]+$/.test(u), 'Use an https:// address or a /path on this site')]);
export const seoSection = z.object({
  title: z.string().trim().max(60, 'Keep the title to 60 characters so Google does not cut it').optional().transform((v) => v || undefined),
  description: z.string().trim().max(155, 'Keep the description to 155 characters').optional().transform((v) => v || undefined),
  titleBn: z.string().trim().max(70).optional().transform((v) => v || undefined),
  descriptionBn: z.string().trim().max(160).optional().transform((v) => v || undefined),
  ogImage: imagePath.optional().transform((v) => v || undefined),
  // IDs are pasted into script URLs later, so only the exact documented shapes are accepted.
  ga4Id: z.union([z.literal(''), z.string().trim().regex(/^G-[A-Z0-9]{6,12}$/, 'A GA4 Measurement ID looks like G-ABC123XYZ')]).optional().transform((v) => v || undefined),
  metaPixelId: z.union([z.literal(''), z.string().trim().regex(/^\d{8,20}$/, 'A Meta Pixel ID is 8–20 digits')]).optional().transform((v) => v || undefined),
}).strict();
const policy = z.string().max(20000, 'That is too long').optional();
export const legalSection = z.object({ privacy: policy, terms: policy, refund: policy, shipping: policy, reviewed: z.boolean() }).strict();
export const sectionParam = z.object({ section: z.enum(['business', 'delivery', 'content', 'seo', 'legal']) });
export const legalParam = z.object({ slug: z.enum(['privacy', 'terms', 'refund', 'shipping']) });
export const auditQuery = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), action: z.string().trim().max(60).optional(), q: z.string().trim().max(60).optional() });
