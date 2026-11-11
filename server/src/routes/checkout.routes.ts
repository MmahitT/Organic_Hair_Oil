import { Router } from 'express';
import * as c from '../controllers/checkout.controller.js';
import { ah } from '../middleware/asyncHandler.js';
import { optionalAuthenticate } from '../middleware/auth.js';
import type { Limiters } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import * as pub from '../controllers/orders.public.controller.js';
import * as contact from '../controllers/contact.controller.js';
import * as rev from '../controllers/reviews.controller.js';
import { authenticate } from '../middleware/auth.js';
import { contactBody } from '../validators/admin.validators.js';
import { cancelRequestBody, invoiceQuery, returnRequestBody, reviewBody, reviewsQuery, trackBody } from '../validators/order.validators.js';
import { checkoutSchema, couponValidateSchema, orderNoParam, orderStatusQuery, quoteSchema } from '../validators/checkout.validators.js';

/** Public shopping endpoints. Prices, fees and stock are decided here, never by the client. */
export function checkoutRouter(l: Limiters) {
  const r = Router();
  r.get('/delivery/zones', ah(c.deliveryZones));
  r.post('/cart/quote', l.quote, validate({ body: quoteSchema }), ah(c.quote));
  r.post('/coupons/validate', l.coupon, validate({ body: couponValidateSchema }), ah(c.validateCoupon));
  r.post('/checkout', l.checkout, ah(optionalAuthenticate), validate({ body: checkoutSchema }), ah(c.checkout));
  r.get('/orders/:orderNo/status', l.sensitive, validate({ params: orderNoParam, query: orderStatusQuery }), ah(c.orderStatus));

  // Order tracking & customer actions (Phase 7). Wrong order number and wrong phone look identical (no enumeration).
  r.post('/orders/track', l.track, validate({ body: trackBody }), ah(pub.track));
  r.get('/orders/my', ah(authenticate), ah(pub.myOrders));
  r.post('/orders/:orderNo/cancel-request', l.sensitive, validate({ params: orderNoParam, body: cancelRequestBody }), ah(pub.cancelRequest));
  r.post('/orders/:orderNo/return-request', l.sensitive, validate({ params: orderNoParam, body: returnRequestBody }), ah(pub.returnRequest));
  r.get('/orders/:orderNo/invoice', l.sensitive, validate({ params: orderNoParam, query: invoiceQuery }), ah(pub.invoice));

  r.post('/contact', l.contact, validate({ body: contactBody }), ah(contact.create));

  // Reviews: verified buyers only, moderated before they appear.
  r.get('/reviews', validate({ query: reviewsQuery }), ah(rev.shopReviews));
  r.get('/products/:slug/reviews', validate({ query: reviewsQuery }), ah(rev.productReviews));
  r.post('/reviews', l.review, validate({ body: reviewBody }), ah(rev.create));
  return r;
}
