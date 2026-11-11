import type { Request, Response } from 'express';
import { Errors } from '../middleware/errorHandler.js';
import { audit } from '../services/audit.service.js';
import { customerDetail, csv, exportCustomers, listCustomers, updateCustomer } from '../services/customers.service.js';

export async function list(req: Request, res: Response) {
  const q = req.query as unknown as Parameters<typeof listCustomers>[0];
  const { items, total } = await listCustomers(q);
  res.json({ success: true, data: { items }, meta: { page: q.page, limit: q.limit, total } });
}

export async function detail(req: Request, res: Response) {
  const c = await customerDetail(req.params['phone']!);
  if (!c) throw Errors.notFound('Customer not found');
  res.json({ success: true, data: { customer: c } });
}

export async function patch(req: Request, res: Response) {
  const phone = req.params['phone']!;
  if (!(await customerDetail(phone))) throw Errors.notFound('Customer not found');
  const r = await updateCustomer(phone, req.body, req.principal!.id);
  await audit({ req, action: req.body.isBlocked === undefined ? 'customer.notes' : req.body.isBlocked ? 'customer.block' : 'customer.unblock', entityType: 'Customer', entityId: phone, before: r.before, after: r.after });
  res.json({ success: true, data: { customer: await customerDetail(phone) } });
}

/** Contains phone numbers: admin/superadmin only, and every export is recorded. */
export async function exportCsv(req: Request, res: Response) {
  const body = await exportCustomers();
  await audit({ req, action: 'customer.export', entityType: 'Customer', after: { rows: body.split('\r\n').length - 1 } });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="customers.csv"', 'Cache-Control': 'no-store' }).send(body);
}
void csv;
