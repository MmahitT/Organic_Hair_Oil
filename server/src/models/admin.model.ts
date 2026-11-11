import { Schema, model, type InferSchemaType } from 'mongoose';
import { ADMIN_ROLES, baseOptions } from './common.js';

const refreshTokenSchema = new Schema(
  { hash: { type: String, required: true }, expiresAt: { type: Date, required: true }, userAgent: { type: String, maxlength: 300 } },
  { _id: false },
);

// Separate collection from User so customer accounts can never gain admin privileges by data edit.
const adminSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ADMIN_ROLES, required: true },
    permissions: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    failedLoginCount: { type: Number, default: 0, min: 0 },
    lockUntil: Date,
    lastLoginAt: Date,
    refreshTokens: { type: [refreshTokenSchema], default: [], select: false },
  },
  baseOptions,
);

adminSchema.index({ email: 1 }, { unique: true });

export type AdminDoc = InferSchemaType<typeof adminSchema>;
export const Admin = model('Admin', adminSchema);
