import { Schema, model } from 'mongoose';
import { PAYMENT_STATUSES, baseOptions, integerBdt } from './common.js';

// Manual payments only (COD, bKash/Nagad/Rocket send-money, bank transfer). Never store card data or any secrets here.
const paymentSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    provider: { type: String, enum: ['manual', 'cod'], required: true },
    method: { type: String, maxlength: 30 },
    tranId: { type: String, required: true, maxlength: 64 },
    amount: { type: Number, required: true, validate: integerBdt },
    currency: { type: String, required: true, enum: ['BDT'], default: 'BDT' },
    status: { type: String, enum: PAYMENT_STATUSES, required: true, default: 'initiated' },
    note: { type: String, maxlength: 500 },
    manual: {
      senderNumber: String,
      senderName: { type: String, maxlength: 60 },
      reference: { type: String, maxlength: 100 },
      trxId: String,
      submittedAt: Date,
      verifiedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
      verifiedAt: Date,
    },
    refundedTotal: { type: Number, default: 0, min: 0, validate: integerBdt },
    refunds: {
      type: [new Schema({ amount: { type: Number, required: true, validate: integerBdt }, reason: String, refId: String, at: { type: Date, default: Date.now }, by: { type: Schema.Types.ObjectId, ref: 'Admin' } }, { _id: false })],
      default: [],
    },
    // Append-only event log used to de-duplicate callbacks/IPN and to audit what happened.
    events: {
      type: [new Schema({ type: { type: String, required: true }, at: { type: Date, default: Date.now }, payloadHash: String, by: String, note: String }, { _id: false })],
      default: [],
    },
  },
  baseOptions,
);

paymentSchema.index({ tranId: 1 }, { unique: true });
paymentSchema.index({ order: 1 });
paymentSchema.index({ 'manual.trxId': 1 }, { unique: true, sparse: true });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ provider: 1, status: 1, createdAt: 1 });

export const Payment = model('Payment', paymentSchema);
