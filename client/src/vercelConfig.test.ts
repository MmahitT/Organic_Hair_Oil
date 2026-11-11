import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { securityHeaders } from '../security-headers';

// Vercel cannot read dist/_headers, so vercel.json carries a copy of the website's security headers. Keep them identical.
describe('vercel.json', () => {
  const cfg = JSON.parse(readFileSync(resolve(process.cwd(), '..', 'vercel.json'), 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[]; rewrites: { source: string; destination: string }[] };
  it('sends the same security headers as security-headers.ts', () => {
    const page = cfg.headers.find((h) => h.source.startsWith('/(('))!;
    expect(Object.fromEntries(page.headers.map((h) => [h.key, h.value]))).toEqual(securityHeaders());
  });
  it('routes /api to the function first and every other page to the app shell', () => {
    expect(cfg.rewrites[0]).toEqual({ source: '/api/(.*)', destination: '/api/index.mjs' });
    expect(cfg.rewrites[1]!.destination).toBe('/index.html');
  });
});
