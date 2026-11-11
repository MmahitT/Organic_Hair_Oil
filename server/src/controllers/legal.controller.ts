import type { Request, Response } from 'express';
import { Errors } from '../middleware/errorHandler.js';
import { getLegalPage, isLegalSlug, legalIndex } from '../services/legal.service.js';

export async function index(_req: Request, res: Response) {
  res.json({ success: true, data: { pages: await legalIndex() } });
}

/** Policy text for the storefront (Markdown, already filled with the owner's business details). */
export async function page(req: Request, res: Response) {
  const slug = req.params['slug']!;
  if (!isLegalSlug(slug)) throw Errors.notFound('Page not found');
  const p = await getLegalPage(slug);
  if (!p) throw Errors.notFound('Page not found');
  res.set('Cache-Control', 'public, max-age=60').json({ success: true, data: p });
}
