import { z } from 'zod';
import { normalizeBdPhone } from '../utils/phone.js';

export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters');

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizeBdPhone(v);
    if (!n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid Bangladeshi mobile number' });
    return n ?? '';
  });

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: phoneSchema,
  email: emailSchema.optional(),
  password: passwordSchema,
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(72),
});

export const adminLoginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(72) });

export const changePasswordSchema = z.object({ current: z.string().min(1).max(72), new: passwordSchema });

export const createStaffSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['admin', 'staff']),
});

export const updateStaffSchema = z.object({ isActive: z.boolean().optional(), role: z.enum(['admin', 'staff']).optional() }).refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const objectIdParam = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id') });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().max(80).optional(),
});
