import { Schema, model } from 'mongoose';
import { baseOptions } from './common.js';

const reviewSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phoneHash: { type: String, select: false },
    rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
    title: { type: String, maxlength: 100 },
    comment: { type: String, required: true, trim: true, maxlength: 1000 },
    images: [{ url: String, publicId: String }],
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    isVerifiedPurchase: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    adminReply: { type: String, maxlength: 500 },
  },
  baseOptions,
);

reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
// One review per purchased product per order (only enforced when an order is attached).
reviewSchema.index({ order: 1, product: 1 }, { unique: true, partialFilterExpression: { order: { $type: 'objectId' } } });

export const Review = model('Review', reviewSchema);
