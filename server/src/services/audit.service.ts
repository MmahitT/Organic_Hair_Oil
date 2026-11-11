import type { Request } from 'express';
import { logger } from '../config/logger.js';
import { AuditLog } from '../models/misc.model.js';

const REDACT = /pass(word)?|hash|token|secret|authorization|cookie/i;

export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redact) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, REDACT.test(k) ? '[redacted]' : redact(v)]),
    ) as T;
  }
  return value;
}

interface AuditInput {
  action: string;
  req?: Request;
  actor?: { id: string; kind: 'admin' | 'user'; role?: string };
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

/** Records a sensitive action. Never throws: an audit failure must not break the user's request. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const p = input.actor ?? (input.req?.principal && { id: input.req.principal.id, kind: input.req.principal.kind, role: input.req.principal.role });
    await AuditLog.create({
      actor: p?.id,
      actorKind: p?.kind ?? 'system',
      role: p?.role,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before === undefined ? undefined : redact(input.before),
      after: input.after === undefined ? undefined : redact(input.after),
      ip: input.req?.ip,
      userAgent: input.req?.get('user-agent')?.slice(0, 300),
    });
  } catch (err) {
    logger.error({ err, action: input.action }, 'Failed to write audit log');
  }
}
