import type { Request, Response } from 'express';
import { Errors } from '../middleware/errorHandler.js';
import { Order } from '../models/order.model.js';
import { WebsiteSettings } from '../models/misc.model.js';
import { findOrderForCustomer, presentOrderPublic, requestCancellation, requestReturn, returnWindowDays } from '../services/order.service.js';
import { renderInvoice } from '../utils/invoice.js';
import { signOrderToken, verifyOrderToken } from '../utils/tokens.js';

/** Order number + phone. Wrong order number and wrong phone give the identical answer. */
export async function track(req: Request, res: Response) {
  const { orderNo, phone } = req.body as { orderNo: string; phone: string };
  const o = await findOrderForCustomer({ orderNo, phone });
  res.json({ success: true, data: { ...presentOrderPublic(o, await returnWindowDays()), token: signOrderToken(o.orderNo) } });
}

export async function cancelRequest(req: Request, res: Response) {
  const o = await findOrderForCustomer({ orderNo: req.params['orderNo']!, ...(req.body as { phone?: string; token?: string }) });
  await requestCancellation(o, (req.body as { reason: string }).reason);
  res.json({ success: true, data: { requested: true } });
}

export async function returnRequest(req: Request, res: Response) {
  const o = await findOrderForCustomer({ orderNo: req.params['orderNo']!, ...(req.body as { phone?: string; token?: string }) });
  await requestReturn(o, (req.body as { reason: string }).reason);
  res.json({ success: true, data: { requested: true } });
}

/** Invoice for the customer: needs the signed token (issued at checkout or by tracking). Shows no street address. */
export async function invoice(req: Request, res: Response) {
  const orderNo = req.params['orderNo']!;
  if (verifyOrderToken((req.query as { token: string }).token) !== orderNo) throw Errors.unauthenticated('This invoice link is invalid or has expired.');
  const o = await Order.findOne({ orderNo }).lean();
  if (!o?.customer) throw Errors.notFound('Order not found');
  const s = await WebsiteSettings.findOne({ key: 'main' }, { business: 1 }).lean();
  const html = renderInvoice({ ...o, customer: { name: o.customer.name, phone: `${o.customer.phone.slice(0, 3)}*****${o.customer.phone.slice(-3)}`, district: o.customer.district } }, s?.business ?? {});
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }).type('html').send(html);
}

export async function myOrders(req: Request, res: Response) {
  const items = await Order.find({ user: req.principal!.id }, { orderNo: 1, status: 1, paymentStatus: 1, paymentMethod: 1, total: 1, createdAt: 1, 'items.name': 1, 'items.quantity': 1 }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ success: true, data: { items } });
}
