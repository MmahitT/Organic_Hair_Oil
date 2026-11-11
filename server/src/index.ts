import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { startPaymentJobs } from './jobs/payments.job.js';

await connectDb();
const server = createApp({ enforceRateLimits: true }).listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);
});

const stopJobs = startPaymentJobs();

const shutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down`);
  stopJobs();
  server.close(async () => {
    await disconnectDb();
    process.exit(0);
  });
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
