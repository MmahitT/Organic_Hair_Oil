import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  BACKEND_URL: z.string().url().default('http://localhost:5001'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TRUST_PROXY: bool.default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().default('beauty_organic'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(14),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: bool.default(false),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  // Cloudinary (optional until the owner creates an account; uploads return 503 when unset)
  CLOUDINARY_CLOUD_NAME: z.string().optional().or(z.literal('').transform(() => undefined)),
  CLOUDINARY_API_KEY: z.string().optional().or(z.literal('').transform(() => undefined)),
  CLOUDINARY_API_SECRET: z.string().optional().or(z.literal('').transform(() => undefined)),
  CLOUDINARY_UPLOAD_FOLDER: z.string().regex(/^[a-zA-Z0-9_\-/]+$/).default('beauty-organic'),


  SEED_ADMIN_EMAIL: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  SEED_ADMIN_PASSWORD: z.string().optional().or(z.literal('').transform(() => undefined)),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast: never boot with invalid configuration. Only variable names are printed, never values.
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
export const isProd = env.NODE_ENV === 'production';
if (isProd && !env.COOKIE_SECURE) {
  console.error('COOKIE_SECURE must be true in production');
  process.exit(1);
}
if (isProd) {
  // Hard stops for unsafe production configuration (spec §14): fail at boot rather than run insecurely.
  const problems: string[] = [];
  if (env.BCRYPT_SALT_ROUNDS < 12) problems.push('BCRYPT_SALT_ROUNDS must be at least 12 in production');
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  if (/^(change_me|test_|secret|password)/i.test(env.JWT_ACCESS_SECRET) || /^(change_me|test_|secret|password)/i.test(env.JWT_REFRESH_SECRET)) problems.push('JWT secrets look like placeholders; generate random ones');
  if (corsOrigins.some((o) => !o.startsWith('https://'))) problems.push('CORS_ORIGINS must contain only https:// origins in production');
  if (!env.FRONTEND_URL.startsWith('https://')) problems.push('FRONTEND_URL must be https:// in production');
  if (problems.length) { console.error(`Unsafe production configuration:\n - ${problems.join('\n - ')}`); process.exit(1); }
}
