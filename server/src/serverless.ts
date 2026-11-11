import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { logger } from './config/logger.js';
import { processNotifications } from './services/notification.service.js';
import { expireStaleOrders } from './services/payment.service.js';

/**
 * Serverless entry (Vercel). Differences from `index.ts` (the long-running server):
 *  - the database connection is opened lazily and re-used while the function instance is warm;
 *  - there is no background timer: the payment-expiry/notification jobs run from a scheduled call to
 *    /api/v1/internal/jobs, which only answers when the caller presents CRON_SECRET (otherwise it looks like any unknown URL).
 */
const app = createApp({ enforceRateLimits: true });
let ready: Promise<unknown> | null = null;
const connect = () => (ready ??= connectDb().catch((err: unknown) => { ready = null; throw err; }));

const safeEqual = (a: string, b: string) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const sendJson = (res: ServerResponse, status: number, body: unknown) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try { await connect(); } catch (err) {
    logger.error({ err: (err as Error).message }, 'Database connection failed');
    return sendJson(res, 503, { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable. Please try again shortly.' } });
  }
  if (req.url?.split('?')[0] === '/api/v1/internal/jobs') {
    const secret = process.env['CRON_SECRET'];
    const given = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!secret || !safeEqual(given, secret)) return sendJson(res, 404, { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
    try {
      const expiry = await expireStaleOrders();
      const messages = await processNotifications();
      logger.info({ expiry, messages }, 'Scheduled jobs ran');
      return sendJson(res, 200, { success: true, data: { expiry, messages } });
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Scheduled jobs failed');
      return sendJson(res, 500, { success: false, error: { code: 'JOBS_FAILED', message: 'Jobs failed' } });
    }
  }
  app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
