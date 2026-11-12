import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { securityHeaders } from '../security-headers';

type Cfg = { headers?: { source: string; headers: { key: string; value: string }[] }[]; rewrites: { source: string; destination: string }[]; crons?: { path: string }[] };
const load = (rel: string) => JSON.parse(readFileSync(resolve(process.cwd(), rel), 'utf8')) as Cfg;

// Vercel cannot read dist/_headers, so client/vercel.json carries a copy of the website's security headers. Keep them identical.
describe('client/vercel.json (website project)', () => {
  const cfg = load('vercel.json');
  it('sends the same security headers as security-headers.ts', () => {
    const page = cfg.headers!.find((h) => h.source.startsWith('/(('))!;
    expect(Object.fromEntries(page.headers.map((h) => [h.key, h.value]))).toEqual(securityHeaders());
  });
  it('forwards /api to the API project first and every other page to the app shell', () => {
    expect(cfg.rewrites[0]!.source).toBe('/api/(.*)');
    expect(cfg.rewrites[0]!.destination).toMatch(/^https:\/\/.+\/api\/\$1$/);
    expect(cfg.rewrites[1]!.destination).toBe('/index.html');
  });
});

describe('server/vercel.json (API project)', () => {
  const cfg = load('../server/vercel.json');
  it('serves /api through the Express function and runs the scheduled jobs', () => {
    expect(cfg.rewrites[0]).toEqual({ source: '/api/(.*)', destination: '/api/index.mjs' });
    expect(cfg.crons![0]!.path).toBe('/api/v1/internal/jobs');
  });
});
