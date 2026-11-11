import { Schema, model, type InferSchemaType } from 'mongoose';
import { BD_PHONE_REGEX } from '../utils/phone.js';
import { baseOptions } from './common.js';

const refreshTokenSchema = new Schema(
  { hash: { type: String, required: true }, expiresAt: { type: Date, required: true }, userAgent: { type: String, maxlength: 300 } },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, lowercase: true, trim: true, maxlength: 254, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    phone: { type: String, required: true, match: BD_PHONE_REGEX },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['customer'], default: 'customer' },
    isActive: { type: Boolean, default: true },
    isBlocked: { type: Boolean, default: false },
    notes: { type: String, maxlength: 1000 },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    lastLoginAt: Date,
    refreshTokens: { type: [refreshTokenSchema], default: [], select: false },
  },
  baseOptions,
);

userSchema.index({ phone: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true, sparse: true });

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
