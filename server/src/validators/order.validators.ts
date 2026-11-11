import { z } from 'zod';
import { phoneSchema } from './auth.validators.js';
import { orderNoParam } from './checkout.validators.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');
const orderNo = orderNoParam.shape.orderNo;
const reason = z.string().trim().min(3, 'Please tell us the reason').max(300);

/* ---- customer ---- */
export const trackBody = z.object({ orderNo, phone: phoneSchema });
/** Customer actions are proven either by the signed confirmation token or by order number + phone. */
const proof = z.object({ phone: phoneSchema.optional(), token: z.string().min(20).max(1000).optional() }).refine((v) => v.phone || v.token, 'Phone number or token required');
export const cancelRequestBody = z.object({ reason }).and(proof);
export const returnRequestBody = z.object({ reason }).and(proof);
export const invoiceQuery = z.object({ token: z.string().min(20).max(1000) });
export { orderNoParam };

export const reviewBody = z.object({
  orderNo, phone: phoneSchema, productId: objectId,
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(100).optional(),
  comment: z.string().trim().min(5, 'Please write a few words').max(1000),
  name: z.string().trim().max(80).optional(),
});
export const reviewsQuery = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(10) });

/* ---- admin ---- */
export const statusBody = z.object({ status: z.enum(['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered']), note: z.string().trim().max(300).optional() });
export const cancelBody = z.object({ reason });
export const returnBody = z.object({ restock: z.boolean(), note: z.string().trim().max(300).default('') });
export const requestDecisionBody = z.object({ approve: z.boolean(), note: z.string().trim().max(300).default('') });
export const requestParams = z.object({ id: objectId, kind: z.enum(['cancellation', 'return']) });
const optText = (n: number) => z.string().trim().max(n).optional().transform((v) => v || undefined);
export const orderPatchBody = z.object({
  notes: z.string().trim().max(2000).optional(),
  courier: z.object({ name: optText(60), trackingNo: optText(60), consignmentId: optText(60) }).strict().optional(),
  customer: z.object({ address: z.string().trim().min(10).max(300).optional(), city: z.string().trim().min(2).max(80).optional(), instructions: z.string().trim().max(300).optional() }).strict().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const exportQuery = z.object({ status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned']).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() });
export const orderSettingsBody = z.object({
  autoConfirm: z.boolean().optional(),
  returnWindowDays: z.number().int().min(0).max(365).nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const adminReviewsQuery = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), status: z.enum(['pending', 'approved', 'rejected']).optional() });
export const reviewPatchBody = z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional(), isFeatured: z.boolean().optional(), adminReply: z.string().trim().max(500).optional() }).refine((v) => Object.keys(v).length > 0, 'Nothing to update');

/* ---- dashboard ---- */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');
export const dashboardQuery = z.object({ from: day.optional(), to: day.optional() }).refine(
  (v) => !v.from || !v.to || (v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 366 * 86_400_000), 'Choose a range of up to one year (from ≤ to)',
);
