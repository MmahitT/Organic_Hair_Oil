import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { Errors } from '../middleware/errorHandler.js';
import { ContactMessage } from '../models/misc.model.js';
import { audit } from '../services/audit.service.js';

/** Public contact form. A filled honeypot field is silently accepted (so bots learn nothing) and thrown away. */
export async function create(req: Request, res: Response) {
  const { website, name, phone, email, message } = req.body as { website?: string; name: string; phone?: string; email?: string; message: string };
  if (!website) {
    await ContactMessage.create({ name, phone, email, message, ipHash: crypto.createHash('sha256').update(`${req.ip}:${env.JWT_ACCESS_SECRET}`).digest('hex').slice(0, 16) });
  }
  res.status(201).json({ success: true, data: { received: true } });
}

export async function list(req: Request, res: Response) {
  const { page, limit, status } = req.query as unknown as { page: number; limit: number; status?: string };
  const filter: Record<string, unknown> = status ? { status } : {};
  const [items, total] = await Promise.all([ContactMessage.find(filter).select('-ipHash').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), ContactMessage.countDocuments(filter)]);
  res.json({ success: true, data: { items }, meta: { page, limit, total } });
}

export async function setStatus(req: Request, res: Response) {
  const m = await ContactMessage.findByIdAndUpdate(req.params['id'], { $set: { status: (req.body as { status: string }).status } }, { new: true }).select('-ipHash').lean();
  if (!m) throw Errors.notFound('Message not found');
  await audit({ req, action: 'message.status', entityType: 'ContactMessage', entityId: String(m._id), after: { status: m.status } });
  res.json({ success: true, data: { message: m } });
}
