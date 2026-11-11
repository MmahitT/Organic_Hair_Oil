import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { escapeRegex } from '../utils/slug.js';
import { Errors } from '../middleware/errorHandler.js';
import { Admin } from '../models/admin.model.js';
import { AuditLog } from '../models/misc.model.js';
import { audit } from '../services/audit.service.js';
import { createAdminAccount } from '../services/auth.service.js';

export async function listStaff(_req: Request, res: Response) {
  const staff = await Admin.find().sort({ createdAt: 1 });
  res.json({ success: true, data: { staff } });
}

export async function createStaff(req: Request, res: Response) {
  const created = await createAdminAccount(req.body);
  await audit({ action: 'staff.created', req, entityType: 'Admin', entityId: String(created._id), after: { email: created.email, role: created.role } });
  res.status(201).json({ success: true, data: { staff: created } });
}

export async function updateStaff(req: Request, res: Response) {
  const id = req.params['id']!;
  const target = await Admin.findById(id);
  if (!target) throw Errors.notFound('Staff account not found');
  if (target.role === 'superadmin') throw Errors.forbidden('The superadmin account cannot be modified here');
  if (id === req.principal!.id) throw Errors.businessRule('You cannot change your own account here');
  const before = { isActive: target.isActive, role: target.role };
  if (req.body.isActive !== undefined) target.isActive = req.body.isActive;
  if (req.body.role !== undefined) target.role = req.body.role;
  await target.save();
  if (req.body.isActive === false) await Admin.updateOne({ _id: id }, { $set: { refreshTokens: [] } }); // end all sessions
  await audit({ action: 'staff.updated', req, entityType: 'Admin', entityId: id, before, after: { isActive: target.isActive, role: target.role } });
  res.json({ success: true, data: { staff: target } });
}

export async function listAuditLogs(req: Request, res: Response) {
  const { page, limit, action, q } = req.query as unknown as { page: number; limit: number; action?: string; q?: string };
  const filter: Record<string, unknown> = {};
  if (action) filter['action'] = action;
  if (q) filter['$or'] = [{ action: mongoose.trusted({ $regex: escapeRegex(q), $options: 'i' }) }, { entityType: mongoose.trusted({ $regex: escapeRegex(q), $options: 'i' }) }];
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ success: true, data: { items }, meta: { page, limit, total } });
}
