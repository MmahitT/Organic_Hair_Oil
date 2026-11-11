import type { SchemaOptions } from 'mongoose';

export const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'initiated', 'pending', 'paid', 'failed', 'cancelled', 'expired',
  'refund_pending', 'refunded', 'partially_refunded', 'cod_pending', 'cod_collected',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['cod', 'manual_bkash', 'manual_nagad', 'manual_rocket', 'manual_bank'] as const;
export const ADMIN_ROLES = ['superadmin', 'admin', 'staff'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Whole-taka integer validator (money is never stored as float). */
export const integerBdt = {
  // null/undefined are allowed here (optional fields cleared by the admin form); `required: true` still rejects them.
  validator: (v: number | null | undefined) => v == null || (Number.isInteger(v) && v >= 0),
  message: '{PATH} must be a non-negative whole number of taka',
};

const SENSITIVE = new Set(['__v', 'passwordHash', 'refreshTokens']);

export const baseOptions = {
  timestamps: true,
  strict: true,
  toJSON: {
    virtuals: false,
    versionKey: false,
    transform: (_doc, ret) => {
      const out = ret as Record<string, unknown>;
      for (const k of Object.keys(out)) if (SENSITIVE.has(k)) delete out[k];
      return out;
    },
  },
} satisfies SchemaOptions;

export const slugValidator = {
  validator: (v: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v),
  message: 'Invalid slug',
};
