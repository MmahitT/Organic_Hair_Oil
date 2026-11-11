import { logger } from '../config/logger.js';
import { providers } from '../integrations/notifications.js';
import { Notification, WebsiteSettings } from '../models/misc.model.js';
import { Order } from '../models/order.model.js';

export type Template = 'order_placed' | 'payment_received' | 'order_confirmed' | 'order_shipped' | 'order_out_for_delivery' | 'order_delivered' | 'order_cancelled';
export const STATUS_TEMPLATE: Record<string, Template | undefined> = { confirmed: 'order_confirmed', shipped: 'order_shipped', out_for_delivery: 'order_out_for_delivery', delivered: 'order_delivered', cancelled: 'order_cancelled' };

const MAX_ATTEMPTS = 3;
const money = (n: number) => `BDT ${n.toLocaleString('en-US')}`;

interface Payload { orderNo: string; total: number; name: string; courier?: string; trackingNo?: string; business?: string }

/** Plain-text bodies. Kept short, factual, and free of unverified claims. */
export function renderMessage(t: Template, p: Payload): { subject: string; text: string } {
  const sign = `\n\n${p.business ?? 'Beauty Organic Hair Oil'}`;
  const hi = `Hello ${p.name},\n\n`;
  const map: Record<Template, [string, string]> = {
    order_placed: [`We received your order ${p.orderNo}`, `${hi}Thank you! We received your order ${p.orderNo} (total ${money(p.total)}). We will confirm it on WhatsApp shortly.`],
    payment_received: [`Payment received for ${p.orderNo}`, `${hi}We received your payment of ${money(p.total)} for order ${p.orderNo}. Thank you!`],
    order_confirmed: [`Order ${p.orderNo} confirmed`, `${hi}Your order ${p.orderNo} is confirmed and will be prepared for delivery.`],
    order_shipped: [`Order ${p.orderNo} shipped`, `${hi}Your order ${p.orderNo} has been shipped.${p.courier ? ` Courier: ${p.courier}.` : ''}${p.trackingNo ? ` Tracking no: ${p.trackingNo}.` : ''}`],
    order_out_for_delivery: [`Order ${p.orderNo} is out for delivery`, `${hi}Your order ${p.orderNo} is out for delivery. Please keep your phone nearby.`],
    order_delivered: [`Order ${p.orderNo} delivered`, `${hi}Your order ${p.orderNo} was delivered. We hope you enjoy it!`],
    order_cancelled: [`Order ${p.orderNo} cancelled`, `${hi}Your order ${p.orderNo} has been cancelled. If you did not expect this, please message us on WhatsApp.`],
  };
  return { subject: map[t][0], text: map[t][1] + sign };
}

/** Records the messages an order event should produce. Never throws: a messaging problem must not break an order. */
export async function enqueueOrderNotification(orderId: unknown, template: Template): Promise<void> {
  try {
    const o = await Order.findById(orderId, { orderNo: 1, total: 1, customer: 1, courier: 1 }).lean();
    if (!o?.customer) return;
    const s = await WebsiteSettings.findOne({ key: 'main' }, { 'business.name': 1 }).lean();
    const payload: Payload = { orderNo: o.orderNo, total: o.total, name: o.customer.name.split(' ')[0] ?? o.customer.name, courier: o.courier?.name ?? undefined, trackingNo: o.courier?.trackingNo ?? undefined, business: s?.business?.name };
    const rows = [];
    if (o.customer.email) rows.push({ channel: 'email' as const, to: o.customer.email });
    rows.push({ channel: 'sms' as const, to: o.customer.phone });
    await Notification.insertMany(rows.map((r) => ({ ...r, template, payload, order: o._id, status: 'queued' as const })));
  } catch (err) {
    logger.warn({ err: (err as Error).message, template }, 'Could not queue notification');
  }
}

/** Sends queued messages through whichever providers are registered. Without a provider they simply wait. */
export async function processNotifications(limit = 50): Promise<{ sent: number; failed: number; waiting: number }> {
  const queued = await Notification.find({ status: 'queued' }).sort({ createdAt: 1 }).limit(limit).lean();
  let sent = 0, failed = 0, waiting = 0;
  for (const n of queued) {
    const provider = n.channel === 'email' ? providers.email : n.channel === 'sms' ? providers.sms : null;
    if (!provider) { waiting++; continue; }
    const { subject, text } = renderMessage(n.template as Template, n.payload as Payload);
    try {
      const r = await provider.send({ to: n.to, subject, text });
      await Notification.updateOne({ _id: n._id, status: 'queued' }, { $set: { status: 'sent', sentAt: new Date(), providerMessageId: r.providerMessageId }, $inc: { attempts: 1 } });
      sent++;
    } catch (err) {
      const attempts = (n.attempts ?? 0) + 1;
      await Notification.updateOne({ _id: n._id, status: 'queued' }, { $set: { lastError: (err as Error).message.slice(0, 300), status: attempts >= MAX_ATTEMPTS ? 'failed' : 'queued' }, $inc: { attempts: 1 } });
      failed++;
    }
  }
  return { sent, failed, waiting };
}
