import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { Product } from '../models/catalog.model.js';
import { Review } from '../models/review.model.js';
import { findOrderForCustomer } from './order.service.js';
import { normalizeBdPhone } from '../utils/phone.js';

/** Reviews are plain text: markup and control characters are removed on the way in (the UI also escapes on the way out). */
const isControl = (ch: string) => { const c = ch.charCodeAt(0); return (c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 127; };
export const cleanText = (s: string) => [...s.replace(/<[^>]*>/g, ' ')].filter((ch) => !isControl(ch)).join('').replace(/[ \t]+/g, ' ').trim();

export const displayName = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : (first ?? 'Customer');
};

export async function recomputeRating(productId: mongoose.Types.ObjectId | string) {
  const [agg] = await Review.aggregate<{ avg: number; n: number }>([{ $match: { product: new mongoose.Types.ObjectId(String(productId)), status: 'approved' } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
  await Product.updateOne({ _id: productId }, { $set: { ratingAverage: agg ? Math.round(agg.avg * 10) / 10 : 0, ratingCount: agg?.n ?? 0 } });
}

export interface ReviewInput { orderNo: string; phone: string; productId: string; rating: number; title?: string; comment: string; name?: string }

/** Only a real, delivered purchase can be reviewed (verified buyer). New reviews wait for the owner's approval. */
export async function submitReview(i: ReviewInput) {
  const o = await findOrderForCustomer({ orderNo: i.orderNo, phone: i.phone });
  if (o.status !== 'delivered') throw new AppError(422, 'NOT_ALLOWED', 'You can write a review after your order has been delivered.');
  const bought = o.items.some((it) => String(it.product) === i.productId || it.components.some((c) => String(c.product) === i.productId));
  if (!bought) throw new AppError(422, 'NOT_ALLOWED', 'This product was not part of your order.');
  const phone = normalizeBdPhone(i.phone)!;
  try {
    const r = await Review.create({
      product: i.productId, order: o._id, name: cleanText(i.name ?? '') || o.customer!.name, rating: i.rating,
      title: i.title ? cleanText(i.title) : undefined, comment: cleanText(i.comment),
      phoneHash: crypto.createHash('sha256').update(`${phone}:${env.JWT_ACCESS_SECRET}`).digest('hex'), isVerifiedPurchase: true, status: 'pending',
    });
    return { id: String(r._id) };
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError(409, 'REVIEW_EXISTS', 'You have already reviewed this product for this order.');
    throw err;
  }
}

export const publicView = (r: { _id: unknown; name: string; rating: number; title?: string | null; comment: string; isVerifiedPurchase?: boolean; adminReply?: string | null; createdAt: Date; product?: unknown }) => ({
  id: String(r._id), name: displayName(r.name), rating: r.rating, title: r.title ?? null, comment: r.comment, verified: Boolean(r.isVerifiedPurchase), reply: r.adminReply ?? null, createdAt: r.createdAt,
});
