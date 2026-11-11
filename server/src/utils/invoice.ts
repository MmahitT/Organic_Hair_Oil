/**
 * Server-rendered invoice page. HTML (not a generated PDF file) so Bangla names/addresses render correctly in every
 * browser; the user prints or saves it as PDF from the browser. Every dynamic value is escaped.
 */
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const taka = (n: number) => `৳${n.toLocaleString('en-US')}`;
const METHOD: Record<string, string> = { cod: 'Cash on Delivery', manual_bkash: 'bKash', manual_nagad: 'Nagad', manual_rocket: 'Rocket' };
const PAY: Record<string, string> = { paid: 'Paid', cod_pending: 'Pay on delivery', cod_collected: 'Paid (cash collected)', initiated: 'Awaiting payment', pending: 'Awaiting verification', failed: 'Payment failed', cancelled: 'Cancelled', expired: 'Expired', refund_pending: 'Refund pending', refunded: 'Refunded' };

export interface InvoiceOrder {
  orderNo: string; createdAt: Date; paymentMethod: string; paymentStatus: string; status: string;
  customer: { name: string; phone: string; address?: string | null; city?: string | null; district: string };
  items: readonly { name: string; quantity: number; unitPrice: number; lineTotal: number; components: readonly { name?: string | null; quantity?: number | null }[] }[];
  subtotal: number; productDiscount: number; couponDiscount: number; deliveryFee: number; total: number; coupon?: { code?: string | null } | null;
}
export interface InvoiceBusiness { name?: string | null; legalName?: string | null; address?: string | null; phone?: string | null; email?: string | null }

export function renderInvoice(o: InvoiceOrder, b: InvoiceBusiness): string {
  const rows = o.items.map((i) => `<tr><td>${esc(i.name)}${i.components.length > 1 ? `<small>${i.components.map((c) => `${c.quantity ?? ''} × ${esc(c.name)}`).join(' + ')}</small>` : ''}</td><td class="n">${i.quantity}</td><td class="n">${taka(i.unitPrice)}</td><td class="n">${taka(i.lineTotal)}</td></tr>`).join('');
  const line = (label: string, v: string, cls = '') => `<tr class="${cls}"><td colspan="3">${label}</td><td class="n">${v}</td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Invoice ${esc(o.orderNo)}</title>
<style>body{font:14px/1.5 -apple-system,Segoe UI,Roboto,"Noto Sans Bengali",sans-serif;color:#252525;margin:0;padding:24px}main{max-width:720px;margin:auto}h1{font-size:22px;margin:0;color:#234B35}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:8px 6px;text-align:left;border-bottom:1px solid #ddd;vertical-align:top}th{font-size:12px;text-transform:uppercase;color:#666}.n{text-align:right;white-space:nowrap}small{display:block;color:#666}.head{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}.tot td{font-weight:700;font-size:16px;border-bottom:0}.muted{color:#666}@media print{body{padding:0}}</style></head><body><main>
<div class="head"><div><h1>${esc(b.name ?? 'Invoice')}</h1><p class="muted">${[b.legalName, b.address, b.phone, b.email].filter(Boolean).map(esc).join('<br>')}</p></div>
<div style="text-align:right"><strong>INVOICE</strong><br>${esc(o.orderNo)}<br><span class="muted">${esc(o.createdAt.toISOString().slice(0, 10))}</span></div></div>
<p><strong>${esc(o.customer.name)}</strong><br>${esc(o.customer.phone)}<br>${esc([o.customer.address, o.customer.city, o.customer.district].filter(Boolean).join(', '))}</p>
<table><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Total</th></tr></thead><tbody>${rows}
${line('Subtotal', taka(o.subtotal))}${o.productDiscount > 0 ? line('Product discount', `−${taka(o.productDiscount)}`) : ''}${o.couponDiscount > 0 ? line(`Coupon ${esc(o.coupon?.code ?? '')}`, `−${taka(o.couponDiscount)}`) : ''}${line('Delivery', o.deliveryFee === 0 ? 'Free' : taka(o.deliveryFee))}${line(o.paymentStatus === 'cod_pending' ? 'Amount to pay on delivery' : 'Total', taka(o.total), 'tot')}</tbody></table>
<p class="muted">Payment: ${esc(METHOD[o.paymentMethod] ?? o.paymentMethod)} — ${esc(PAY[o.paymentStatus] ?? o.paymentStatus)}</p></main></body></html>`;
}
