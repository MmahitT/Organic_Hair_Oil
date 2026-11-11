import { Router, type NextFunction, type Request, type Response } from 'express';
import * as c from '../controllers/catalog.controller.js';
import * as legal from '../controllers/legal.controller.js';
import { ah } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { legalParam } from '../validators/admin.validators.js';
import { publicListQuery, slugParam } from '../validators/catalog.validators.js';

const shortCache = (_req: Request, res: Response, next: NextFunction) => {
  // Short on purpose: admin price/stock edits show up on the storefront within ~10 seconds.
  res.set('Cache-Control', 'public, max-age=10');
  next();
};

/** Public, read-only storefront endpoints. Only published, non-archived products are ever returned. */
export function catalogRouter() {
  const r = Router();
  r.get('/products', shortCache, validate({ query: publicListQuery }), ah(c.listProducts));
  r.get('/products/featured', shortCache, ah(c.featuredProduct));
  r.get('/products/:slug', shortCache, validate({ params: slugParam }), ah(c.productBySlug));
  r.get('/categories', shortCache, ah(c.listCategories));
  r.get('/ingredients', shortCache, ah(c.listIngredients));
  r.get('/settings/public', shortCache, ah(c.publicSettings));
  r.get('/legal', ah(legal.index));
  r.get('/legal/:slug', validate({ params: legalParam }), ah(legal.page));
  return r;
}
