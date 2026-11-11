import { logger } from '../config/logger.js';
import { processNotifications } from '../services/notification.service.js';
import { expireStaleOrders } from '../services/payment.service.js';

/**
 * Background safety nets: (1) give back stock held by unpaid prepaid orders after their window, (2) send queued messages. Both are idempotent and atomic, so running on several instances is safe.
 */
export function startPaymentJobs(everyMs = 60_000): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const exp = await expireStaleOrders();
      const msg = await processNotifications();
      if (exp.released || msg.sent || msg.failed) logger.info({ expiry: exp, messages: msg }, 'Payment jobs ran');
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Payment jobs failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), everyMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
