import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const Errors = {
  unauthenticated: (m = 'Authentication required') => new AppError(401, 'UNAUTHENTICATED', m),
  forbidden: (m = 'You do not have permission to do this') => new AppError(403, 'FORBIDDEN', m),
  notFound: (m = 'Not found') => new AppError(404, 'NOT_FOUND', m),
  conflict: (m: string) => new AppError(409, 'CONFLICT', m),
  businessRule: (m: string, details?: unknown) => new AppError(422, 'BUSINESS_RULE', m, details),
};

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

function send(res: Response, status: number, code: string, message: string, details?: unknown) {
  res.status(status).json({ success: false, error: { code, message, ...(details !== undefined ? { details } : {}) } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) return send(res, err.statusCode, err.code, err.message, err.details);

  if (err instanceof ZodError) {
    return send(res, 400, 'VALIDATION_ERROR', 'Invalid request data', err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return send(res, 400, 'VALIDATION_ERROR', 'Invalid data', Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })));
  }
  if (err instanceof mongoose.Error.CastError) return send(res, 400, 'VALIDATION_ERROR', `Invalid value for ${err.path}`);
  if (typeof err === 'object' && err && (err as { code?: number }).code === 11000) {
    const keys = Object.keys((err as { keyPattern?: Record<string, unknown> }).keyPattern ?? {}).map((k) => k.replace(/^variants\./, ''));
    return send(res, 409, 'CONFLICT', keys.length ? `A record with this ${keys.join(', ')} already exists` : 'A record with these details already exists');
  }
  // body-parser errors (bad JSON, too large)
  const status = (err as { status?: number; statusCode?: number }).status ?? (err as { statusCode?: number }).statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return send(res, status, status === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST', status === 413 ? 'Request body too large' : 'Bad request');
  }

  logger.error({ err, reqId: (req as Request & { id?: unknown }).id }, 'Unhandled error');
  return send(res, 500, 'INTERNAL', env.NODE_ENV === 'production' ? 'Something went wrong. Please try again.' : 'Internal error (see server logs)');
}
