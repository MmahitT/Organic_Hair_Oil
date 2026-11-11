import { Router } from 'express';
import * as c from '../controllers/payments.controller.js';
import { ah } from '../middleware/asyncHandler.js';
import type { Limiters } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { manualSubmitBody } from '../validators/checkout.validators.js';

/** Customer payment endpoint. Submitting a transaction ID only records a claim; an admin verifies it. */
export function paymentsRouter(l: Limiters) {
  const r = Router();
  r.post('/payments/manual/submit', l.sensitive, validate({ body: manualSubmitBody }), ah(c.manualSubmit));
  return r;
}
