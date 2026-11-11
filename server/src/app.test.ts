import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('app basics (no database connected)', () => {
  it('health reports degraded (503) when the database is down', async () => {
    const res = await request(createApp()).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body.data.db).toBe('down');
  });
  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(createApp()).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
