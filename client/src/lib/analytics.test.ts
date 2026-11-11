import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyConsent, COUNTS_AS_PURCHASE, firstTimePurchase, pageView, resetAnalyticsForTests, track } from './analytics';

const scripts = () => [...document.head.querySelectorAll('script[data-tracker]')].map((s) => (s as HTMLScriptElement).src);
const IDS = { ga4Id: 'G-ABC123XYZ9', metaPixelId: '123456789012345' };
beforeEach(() => { window.localStorage.clear(); });
afterEach(() => {
  document.head.querySelectorAll('script[data-tracker]').forEach((s) => s.remove());
  delete window.gtag; delete window.dataLayer; delete window.fbq; delete window._fbq;
  resetAnalyticsForTests();
});

describe('tracking before and after consent', () => {
  it('loads NOTHING until the visitor accepts — no scripts, no events', () => {
    applyConsent(IDS, null);
    track('add_to_cart', { items: [{ item_id: 'S', item_name: 'Oil', price: 550, quantity: 1 }] });
    pageView('/');
    expect(scripts()).toEqual([]);
    expect(window.dataLayer).toBeUndefined();
    expect(window.fbq).toBeUndefined();
  });
  it('"Reject all" keeps everything off', () => {
    applyConsent(IDS, { analytics: false, marketing: false });
    expect(scripts()).toEqual([]);
  });
  it('analytics consent loads Google only; marketing consent loads Meta only', () => {
    applyConsent(IDS, { analytics: true, marketing: false });
    expect(scripts().some((s) => s.includes('googletagmanager.com/gtag/js?id=G-ABC123XYZ9'))).toBe(true);
    expect(scripts().some((s) => s.includes('facebook'))).toBe(false);
    expect(window.fbq).toBeUndefined();
    resetAnalyticsForTests();
    document.head.querySelectorAll('script[data-tracker]').forEach((s) => s.remove());
    delete window.dataLayer;
    applyConsent(IDS, { analytics: false, marketing: true });
    expect(scripts().some((s) => s.includes('connect.facebook.net/en_US/fbevents.js'))).toBe(true);
    expect(scripts().some((s) => s.includes('googletagmanager'))).toBe(false);
  });
  it('never loads a tool whose ID the owner did not set', () => {
    applyConsent({ ga4Id: null, metaPixelId: null }, { analytics: true, marketing: true });
    expect(scripts()).toEqual([]);
  });
  it('sends events only to the tools that were accepted, with no personal data', () => {
    applyConsent(IDS, { analytics: true, marketing: true });
    window.gtag = vi.fn(); window.fbq = Object.assign(vi.fn(), { queue: [], loaded: true, version: '2', push: null }) as never;
    track('purchase', { transaction_id: 'HO-261111-ABCDE', value: 610, items: [{ item_id: 'HO-OIL-200', item_name: 'Hair Oil', price: 550, quantity: 1 }] });
    expect(window.gtag).toHaveBeenCalledWith('event', 'purchase', expect.objectContaining({ currency: 'BDT', value: 610, transaction_id: 'HO-261111-ABCDE' }));
    expect(window.fbq).toHaveBeenCalledWith('track', 'Purchase', expect.objectContaining({ value: 610, currency: 'BDT', content_ids: ['HO-OIL-200'] }));
    expect(JSON.stringify([(window.gtag as ReturnType<typeof vi.fn>).mock.calls, (window.fbq as ReturnType<typeof vi.fn>).mock.calls])).not.toMatch(/phone|email|address|"name":|customer/i);
  });
  it('withdrawing consent switches Google off (documented opt-out flag) and revokes Meta', () => {
    applyConsent(IDS, { analytics: true, marketing: true });
    window.gtag = vi.fn(); window.fbq = Object.assign(vi.fn(), { queue: [], loaded: true, version: '2', push: null }) as never;
    applyConsent(IDS, { analytics: false, marketing: false });
    expect(window['ga-disable-G-ABC123XYZ9']).toBe(true);
    expect(window.fbq).toHaveBeenCalledWith('consent', 'revoke');
    track('add_to_cart', { items: [{ item_id: 'S', item_name: 'Oil', price: 1, quantity: 1 }] });
    expect(window.gtag).not.toHaveBeenCalledWith('event', 'add_to_cart', expect.anything());
  });
  it('reports a page once per path', () => {
    applyConsent(IDS, { analytics: true, marketing: false });
    window.gtag = vi.fn();
    pageView('/'); pageView('/'); pageView('/privacy');
    expect((window.gtag as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[1] === 'page_view')).toHaveLength(2);
  });
});

describe('events that happen while Google is still loading', () => {
  it('are queued and delivered in order once the shim is ready (none are lost)', () => {
    applyConsent(IDS, { analytics: true, marketing: false });
    pageView('/');
    track('add_to_cart', { items: [{ item_id: 'S', item_name: 'Oil', price: 550, quantity: 1 }] });
    expect(window.gtag).toBeUndefined(); // shim not loaded yet
    const shim = [...document.head.querySelectorAll('script[data-tracker]')].find((x) => (x as HTMLScriptElement).src.includes('ga-shim.js')) as HTMLScriptElement;
    window.gtag = vi.fn();
    shim.onload?.(new Event('load')); // the shim finished loading
    const names = (window.gtag as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] === 'event' ? c[1] : c[0]));
    expect(names).toEqual(['js', 'config', 'page_view', 'add_to_cart']);
  });
  it('are discarded if the visitor withdraws consent before the shim loads', () => {
    applyConsent(IDS, { analytics: true, marketing: false });
    track('add_to_cart', { items: [{ item_id: 'S', item_name: 'Oil', price: 550, quantity: 1 }] });
    applyConsent(IDS, { analytics: false, marketing: false });
    const shim = [...document.head.querySelectorAll('script[data-tracker]')].find((x) => (x as HTMLScriptElement).src.includes('ga-shim.js')) as HTMLScriptElement;
    window.gtag = vi.fn();
    shim.onload?.(new Event('load'));
    expect((window.gtag as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'event')).toHaveLength(0);
  });
});

describe('purchase events', () => {
  it('count only accepted orders, and only once per order number', () => {
    expect(COUNTS_AS_PURCHASE).toEqual(['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered']);
    for (const s of ['pending', 'cancelled', 'returned']) expect(COUNTS_AS_PURCHASE).not.toContain(s);
    expect(firstTimePurchase('HO-1')).toBe(true);
    expect(firstTimePurchase('HO-1')).toBe(false);
    expect(firstTimePurchase('HO-2')).toBe(true);
  });
});
