import { Writable } from 'node:stream';
import pino from 'pino';
import { env } from './env.js';

/**
 * Logs must never contain personal data or credentials (spec §14). Three layers:
 *  1. known-sensitive field names are redacted when an object is logged,
 *  2. free text (error messages, stacks, URLs) is scrubbed of phone numbers, emails, tokens and JWTs,
 *  3. request URLs lose secret query parameters (order/invoice tokens travel in the query string).
 */
const PHONE = /(?:\+?88)?(01[3-9])\d{5}(\d{3})/g;
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;
const SECRET_PARAM = /([?&](?:token|access_token|refresh_token|password|secret|key|signature)=)[^&#\s]*/gi;

export function scrub(text: string): string {
  return text.replace(JWT, '[jwt]').replace(SECRET_PARAM, '$1[redacted]').replace(PHONE, '$1*****$2').replace(EMAIL, '$1***@$2');
}

export const scrubUrl = (url: string | undefined): string => scrub(url ?? '');

const errSerializer = (err: unknown) => {
  const e = pino.stdSerializers.err(err as Error);
  return { ...e, message: scrub(String(e.message ?? '')), ...(e.stack ? { stack: scrub(String(e.stack)) } : {}) };
};

const redact = {
  paths: [
    // root-level keys (pino's "*." only matches one level down, so both forms are listed)
    'password', 'passwordHash', 'token', 'refreshToken', 'accessToken', 'phone', 'email', 'address', 'customer', 'signature', 'authorization', 'cookie',
    'req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]',
    '*.password', '*.passwordHash', '*.token', '*.refreshToken', '*.accessToken', '*.phone', '*.email', '*.address', '*.customer', '*.signature',
  ],
  censor: '[redacted]',
};

export function createLogger(destination?: Writable) {
  return pino(
    { level: env.LOG_LEVEL, redact, serializers: { err: errSerializer, error: errSerializer } },
    destination,
  );
}

export const logger = createLogger();

/** Request line for access logs: id, method and a URL with secrets removed — never headers, body or cookies. */
export const reqSerializer = (req: { id?: unknown; method?: string; url?: string }) => ({ id: req.id, method: req.method, url: scrubUrl(req.url) });
