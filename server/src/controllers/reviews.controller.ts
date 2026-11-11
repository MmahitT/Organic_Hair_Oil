import type { Request, Response } from 'express';
import { Errors } from '../middleware/errorHandler.js';
import { Product } from '../models/catalog.model.js';
import { Review } from '../models/review.model.js';
import { audit } from '../services/audit.service.js';
import { publicView, recomputeRating, submitReview } from '../services/review.service.js';

const summaryOf = async (match: Record<string, unknown>) => {
  const rows = await Review.aggregate<{ _id: number; n: number }>([{ $match: { status: 'approved', ...match } }, { $group: { _id: '$rating', n: { $sum: 1 } } }]);
  const count = rows.reduce((s, r) => s + r.n, 0);
  const average = count ? Math.round((rows.reduce((s, r) => s + r._id * r.n, 0) / count) * 10) / 10 : 0;
  return { count, average, distribution: [5, 4, 3, 2, 1].map((star) => ({ star, count: rows.find((r) => r._id === star)?.n ?? 0 })) };
};

export async function productReviews(req: Request, res: Response) {
  const { page, limit } = req.query as unknown as { page: number; limit: number };
  const p = await Product.findOne({ slug: req.params['slug'], visibility: 'published', deletedAt: null }, { _id: 1 }).lean();
  if (!p) throw Errors.notFound('Product not found');
  const [items, summary] = await Promise.all([
    Review.find({ product: p._id, status: 'approved' }).sort({ isFeatured: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    summaryOf({ product: p._id }),
  ]);
  res.json({ success: true, data: { items: items.map(publicView), summary } });
}

/** Latest approved reviews across the shop (landing page). */
export async function shopReviews(req: Request, res: Response) {
  const { limit } = req.query as unknown as { limit: number };
  const [items, summary] = await Promise.all([Review.find({ status: 'approved' }).sort({ isFeatured: -1, createdAt: -1 }).limit(limit).lean(), summaryOf({})]);
  res.json({ success: true, data: { items: items.map(publicView), summary } });
}

export async function create(req: Request, res: Response) {
  const r = await submitReview(req.body);
  res.status(201).json({ success: true, data: { ...r, status: 'pending' } });
}

/* ---------- admin ---------- */
export async function adminList(req: Request, res: Response) {
  const { page, limit, status } = req.query as unknown as { page: number; limit: number; status?: string };
  const filter = status ? { status } : {};
  const [items, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('product', 'name slug').populate('order', 'orderNo').lean(),
    Review.countDocuments(filter),
  ]);
  res.json({ success: true, data: { items }, meta: { page, limit, total } });
}

export async function adminPatch(req: Request, res: Response) {
  const before = await Review.findById(req.params['id']).lean();
  if (!before) throw Errors.notFound('Review not found');
  const after = await Review.findByIdAndUpdate(req.params['id'], { $set: req.body }, { new: true }).lean();
  await recomputeRating(before.product);
  await audit({ req, action: 'review.update', entityType: 'Review', entityId: String(before._id), before: { status: before.status, isFeatured: before.isFeatured }, after: { status: after?.status, isFeatured: after?.isFeatured } });
  res.json({ success: true, data: { review: after } });
}

export async function adminDelete(req: Request, res: Response) {
  const r = await Review.findByIdAndDelete(req.params['id']).lean();
  if (!r) throw Errors.notFound('Review not found');
  await recomputeRating(r.product);
  await audit({ req, action: 'review.delete', entityType: 'Review', entityId: String(r._id) });
  res.status(204).end();
}
