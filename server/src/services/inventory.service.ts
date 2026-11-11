import mongoose from 'mongoose';
import { AppError, Errors } from '../middleware/errorHandler.js';
import { Product } from '../models/catalog.model.js';
import { InventoryMovement } from '../models/misc.model.js';

export interface AdjustInput {
  productId: string;
  sku: string;
  mode: 'delta' | 'set';
  value: number;
  note: string;
  by: string;
}

export interface AdjustResult { sku: string; before: number; after: number; delta: number }

/**
 * The ONLY place manual stock changes happen (order reservation/commit joins it in Phase 5).
 * Uses a single atomic conditional update (never read-then-write) inside a transaction together with the
 * movement log, so concurrent requests can never drive stock negative or below the reserved quantity.
 */
export async function adjustStock(input: AdjustInput): Promise<AdjustResult> {
  const sku = input.sku.toUpperCase();
  const session = await mongoose.startSession();
  try {
    let result!: AdjustResult;
    await session.withTransaction(async () => {
      const product = await Product.findOne({ _id: input.productId, deletedAt: null }, { type: 1, variants: { $elemMatch: { sku } } }, { session }).lean();
      if (!product || !product.variants?.[0]) throw Errors.notFound('Product or SKU not found');
      if (product.type === 'bundle') throw Errors.businessRule('Bundle stock is derived from its components; adjust the component products instead');

      const current = product.variants[0].stock;
      const delta = input.mode === 'set' ? input.value - current : input.value;
      if (delta === 0) { result = { sku, before: current, after: current, delta: 0 }; return; }

      // Conditional atomic update. For "set" we also require stock === the value we read (compare-and-swap).
      const match: Record<string, unknown> = { sku };
      if (input.mode === 'set') match['stock'] = current;
      else if (delta < 0) match['stock'] = mongoose.trusted({ $gte: -delta }); // server-built operator (see db.ts sanitizeFilter)

      const upd = await Product.updateOne(
        { _id: input.productId, deletedAt: null, variants: mongoose.trusted({ $elemMatch: match }) },
        { $inc: { 'variants.$.stock': delta } },
        { session },
      );
      if (upd.matchedCount === 0) {
        throw input.mode === 'set'
          ? new AppError(409, 'CONFLICT', 'Stock changed while you were editing. Reload and try again.')
          : Errors.businessRule('Not enough stock for this adjustment');
      }

      const after = await Product.findOne({ _id: input.productId }, { variants: { $elemMatch: { sku } } }, { session }).lean();
      const v = after!.variants[0]!;
      if (v.stock < v.reservedStock) throw Errors.businessRule('Stock cannot go below the quantity reserved for pending orders');

      await InventoryMovement.create([{ product: input.productId, sku, delta, reason: 'manual', by: input.by, note: input.note }], { session });
      result = { sku, before: v.stock - delta, after: v.stock, delta };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * Gives back exactly the stock an order took (read from its own 'order' movements, so backorder partial takes
 * are restored correctly) and logs each return. Runs inside the caller's transaction; the caller must have won an
 * atomic order-state change first so this can never run twice for one order.
 */
export async function restockOrder(session: mongoose.ClientSession, orderId: mongoose.Types.ObjectId, note: string, reason: 'cancel' | 'return' = 'cancel'): Promise<void> {
  const taken = await InventoryMovement.find({ order: orderId, reason: 'order' }, null, { session }).lean();
  for (const m of taken) {
    const give = -m.delta;
    if (give <= 0) continue;
    await Product.updateOne({ _id: m.product, 'variants.sku': m.sku }, { $inc: { 'variants.$.stock': give } }, { session });
    await InventoryMovement.create([{ product: m.product, sku: m.sku, delta: give, reason, order: orderId, by: 'system', note }], { session });
  }
}
