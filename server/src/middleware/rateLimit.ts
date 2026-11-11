import rateLimit, { type Options } from 'express-rate-limit';
import { env } from '../config/env.js';

export interface LimiterConfig { enforce: boolean }

function make(opts: Partial<Options>, cfg: LimiterConfig) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.NODE_ENV === 'test' && !cfg.enforce,
    handler: (_req, res) => {
      res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } });
    },
    ...opts,
  });
}

export function createLimiters(cfg: LimiterConfig) {
  return {
    global: make({ windowMs: 15 * 60 * 1000, limit: 600 }, cfg),
    auth: make({ windowMs: 15 * 60 * 1000, limit: 20 }, cfg), // login/register/refresh
    adminLogin: make({ windowMs: 15 * 60 * 1000, limit: 8 }, cfg),
    sensitive: make({ windowMs: 60 * 1000, limit: 20 }, cfg), // order lookups, contact, reviews
    quote: make({ windowMs: 60 * 1000, limit: 90 }, cfg), // the cart re-prices on every change
    coupon: make({ windowMs: 60 * 1000, limit: 15 }, cfg), // slows coupon-code guessing
    checkout: make({ windowMs: 60 * 1000, limit: 10 }, cfg),
    track: make({ windowMs: 60 * 1000, limit: 5 }, cfg), // order lookup by number + phone: slows guessing
    contact: make({ windowMs: 60 * 1000, limit: 3 }, cfg), // public contact form
    review: make({ windowMs: 60 * 1000, limit: 5 }, cfg),
  };
}
export type Limiters = ReturnType<typeof createLimiters>;
