import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCatalog } from './catalog';

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const settings = { currency: 'BDT', business: { logo: null }, announcement: null, delivery: { zones: [] }, payments: { cod: true, manual: [], bank: null } };

describe('catalog store', () => {
  beforeEach(() => useCatalog.setState({ status: 'idle', products: [], settings: null, error: null }));
  afterEach(() => vi.unstubAllGlobals());

  it('goes idle → loading → ready on first load', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('/settings/public') ? ok(settings) : ok({ items: [] }))));
    const p = useCatalog.getState().load();
    expect(useCatalog.getState().status).toBe('loading');
    await p;
    expect(useCatalog.getState().status).toBe('ready');
  });

  it('refreshes in the background without ever returning to "loading" (forms must not unmount)', async () => {
    useCatalog.setState({ status: 'ready', settings: settings as never });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('/settings/public') ? ok(settings) : ok({ items: [] }))));
    const seen: string[] = [];
    const unsub = useCatalog.subscribe((s) => seen.push(s.status));
    await useCatalog.getState().load();
    unsub();
    expect(seen.every((s) => s === 'ready')).toBe(true);
  });

  it('keeps showing the shop if a background refresh fails, but reports an error on first load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await useCatalog.getState().load();
    expect(useCatalog.getState().status).toBe('error');
    useCatalog.setState({ status: 'ready' });
    await useCatalog.getState().load();
    expect(useCatalog.getState().status).toBe('ready');
  });
});
