import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import crypto from 'node:crypto';
import { corsOrigins, env } from './config/env.js';
import { logger, reqSerializer } from './config/logger.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { createLimiters } from './middleware/rateLimit.js';
import { adminRouter } from './routes/admin.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { catalogRouter } from './routes/catalog.routes.js';
import { checkoutRouter } from './routes/checkout.routes.js';
import { paymentsRouter } from './routes/payments.routes.js';
import { healthRouter } from './routes/health.routes.js';

export interface AppOptions { enforceRateLimits?: boolean }

export function createApp(opts: AppOptions = {}) {
  const limiters = createLimiters({ enforce: opts.enforceRateLimits ?? false });
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(pinoHttp({ logger, genReqId: (req) => (req.headers['x-request-id'] as string | undefined)?.slice(0, 64) ?? crypto.randomUUID(), autoLogging: env.NODE_ENV !== 'test', serializers: { req: reqSerializer } }));
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || corsOrigins.includes(origin)),
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id'],
    }),
  );
  app.use(limiters.global);
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(mongoSanitize({ replaceWith: '_' })); // strips $ and . operator keys from body/query/params

  // Responses can carry personal data (orders, customers, tokens): browsers and proxies must not keep them.
  // Public catalogue/legal routes set their own short Cache-Control later, which overrides this default.
  app.use('/api/v1', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRouter(limiters));
  app.use('/api/v1', catalogRouter());
  app.use('/api/v1', checkoutRouter(limiters));
  app.use('/api/v1', paymentsRouter(limiters));
  app.use('/api/v1/admin', adminRouter());

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
