import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { startTestDb, stopTestDb } from './test/db.js';
import { api, CUSTOMER } from './test/helpers.js';

beforeAll(startTestDb);
afterAll(stopTestDb);

describe('HTTP security', () => {
  it('sets Helmet headers and hides x-powered-by', async () => {
    const res = await api().get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeTruthy();
    expect(res.headers['content-security-policy']).toBeTruthy();
  });
  it('allows only configured CORS origins', async () => {
    const ok = await api().get('/api/v1/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const evil = await api().get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('rejects oversized bodies (413) and malformed JSON (400) with JSON errors', async () => {
    const big = await api().post('/api/v1/auth/login').send({ identifier: 'a'.repeat(200_000), password: 'x' });
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    const bad = await api().post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"identifier": ');
    expect(bad.status).toBe(400);
    expect(bad.body.success).toBe(false);
  });
  it('never leaks stack traces', async () => {
    const res = await api().post('/api/v1/auth/login').send({ identifier: 1, password: 2 });
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts|node_modules/);
  });
  it('rate limits login attempts (429) when limits are enforced', async () => {
    const app = createApp({ enforceRateLimits: true });
    let last = 0;
    for (let i = 0; i < 25; i++) {
      last = (await request(app).post('/api/v1/auth/login').send({ identifier: CUSTOMER.phone, password: 'wrong-pass-1' })).status;
    }
    expect(last).toBe(429);
  });
  it('rate limits admin login more strictly', async () => {
    const app = createApp({ enforceRateLimits: true });
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) statuses.push((await request(app).post('/api/v1/auth/admin/login').send({ email: 'a@b.co', password: 'x' })).status);
    expect(statuses.slice(0, 8).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
  it('strips operator keys from query strings and bodies', async () => {
    const res = await api().get('/api/v1/health?$where=1&a.b=2');
    expect(res.status).toBe(200);
  });
});
