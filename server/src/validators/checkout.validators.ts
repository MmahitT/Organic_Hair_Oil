import { z } from 'zod';
import { DISTRICTS } from '../constants/districts.js';
import { phoneSchema } from './auth.validators.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');
const sku = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,39}$/, 'Invalid SKU');
const couponCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, 'Invalid coupon code');

export const cartItems = z.array(z.object({ productId: objectId, sku, qty: z.number().int().min(1).max(10) })).min(1, 'Your cart is empty').max(10);

export const quoteSchema = z.object({
  items: cartItems,
  couponCode: couponCode.optional(),
  district: z.enum(DISTRICTS).optional(),
  zoneKey: z.string().trim().max(40).optional(),
  phone: phoneSchema.optional(),
});

export const couponValidateSchema = z.object({ code: couponCode, items: cartItems, district: z.enum(DISTRICTS).optional(), phone: phoneSchema.optional() });

const optionalEmail = z.union([z.literal('').transform(() => undefined), z.string().trim().toLowerCase().email().max(254)]).optional();

export const checkoutSchema = z.object({
  idempotencyKey: z.uuid(),
  items: cartItems,
  customer: z.object({
    name: z.string().trim().min(2).max(80),
    phone: phoneSchema,
    email: optionalEmail,
    district: z.enum(DISTRICTS, 'Please choose your district'),
    city: z.string().trim().min(2, 'Enter your city or area').max(80),
    address: z.string().trim().min(10, 'Please write your full address (at least 10 characters)').max(300),
    instructions: z.string().trim().max(300).optional().transform((v) => v || undefined),
  }),
  paymentMethod: z.enum(['cod', 'manual_bkash', 'manual_nagad', 'manual_rocket', 'manual_bank']),
  couponCode: couponCode.optional(),
  expectedTotal: z.number().int().min(0).max(10_000_000).optional(),
  allowDuplicate: z.boolean().optional(),
  source: z.object({ utmSource: z.string().max(100).optional(), utmMedium: z.string().max(100).optional(), utmCampaign: z.string().max(100).optional(), referrer: z.string().max(300).optional() }).optional(),
});

export const orderNoParam = z.object({ orderNo: z.string().trim().toUpperCase().regex(/^HO-\d{6}-[A-Z0-9]{4,6}$/, 'Invalid order number') });
export const orderStatusQuery = z.object({ token: z.string().min(20).max(1000) });

export const adminOrdersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(80).optional(),
  status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned']).optional(),
  paymentStatus: z.string().trim().max(30).optional(),
  payType: z.enum(['cod', 'prepaid']).optional(), // keeps cash-on-delivery orders separate from prepaid ones
  method: z.enum(['cod', 'manual_bkash', 'manual_nagad', 'manual_rocket', 'manual_bank']).optional(),
  district: z.string().trim().max(40).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // Bangladesh dates
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z.enum(['newest', 'oldest', 'total_desc', 'total_asc']).default('newest'),
});

export const couponBody = z.object({
  code: couponCode,
  type: z.enum(['percent', 'fixed', 'free_delivery']),
  value: z.number().int().min(0).max(1_000_000).optional(), // model default (0) applies on create; absent on partial updates
  maxDiscount: z.number().int().min(0).max(1_000_000).nullable().optional(),
  minOrderValue: z.number().int().min(0).max(1_000_000).optional(),
  startsAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  usageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
  perCustomerLimit: z.number().int().min(1).max(1000).nullable().optional(),
  appliesToProducts: z.array(objectId).max(50).optional(),
  isActive: z.boolean().optional(),
});
export const couponUpdate = couponBody.omit({ code: true }).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

/* ---------- payments ---------- */
export const orderAccessBody = z.object({ orderNo: orderNoParam.shape.orderNo, token: z.string().min(20).max(1000) });
export const manualSubmitBody = orderAccessBody.extend({
  trxId: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9\-/]{4,29}$/, 'Enter the transaction ID or reference number exactly as shown in your payment receipt'),
  senderNumber: phoneSchema.optional(), // bKash / Nagad / Rocket: the number the money was sent from
  senderName: z.string().trim().max(60).optional(), // bank: name on the sending account
  reference: z.string().trim().max(100).optional().transform((x) => x || undefined), // any extra payment reference the customer used
});
export const resolvePaymentBody = z.object({ approve: z.boolean(), note: z.string().trim().max(300).default('') });
export const adminPaymentsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['initiated', 'pending', 'paid', 'failed', 'cancelled', 'expired', 'refund_pending', 'refunded', 'partially_refunded', 'cod_pending', 'cod_collected']).optional(),
  provider: z.enum(['manual', 'cod']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().trim().max(60).optional(),
});
const mfsNumber = z.union([z.literal(''), phoneSchema]).nullable().optional();
const instruction = z.string().trim().max(500).optional();
const bankField = (n: number) => z.string().trim().max(n).optional();
export const paymentSettingsBody = z.object({
  codEnabled: z.boolean().optional(),
  manual: z.object({
    enabled: z.boolean().optional(), bkash: mfsNumber, nagad: mfsNumber, rocket: mfsNumber,
    instructions: z.object({ bkash: instruction, nagad: instruction, rocket: instruction }).strict().optional(),
  }).strict().optional(),
  bank: z.object({
    enabled: z.boolean().optional(), bankName: bankField(80), accountName: bankField(80),
    accountNumber: z.string().trim().max(40).regex(/^[0-9A-Za-z\- ]*$/, 'Account number may contain only letters, digits, spaces and dashes').optional(),
    branch: bankField(80), instructions: instruction,
  }).strict().optional(),
}).strict().refine((x) => Object.keys(x).length > 0, 'Nothing to update');
export const refundBody = z.object({ amount: z.number().int().min(1).max(10_000_000).optional(), reason: z.string().trim().min(3, 'Please note why').max(300) });
