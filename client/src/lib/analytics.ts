import { useCatalog } from '@/store/catalog';

/**
 * Google Analytics 4 and Meta Pixel — loaded ONLY after the visitor consents, and only for tools whose ID the owner set
 * in Admin → Website. No personal data (name, phone, email, address) is ever sent: only product ids/names, prices and
 * the order number of a confirmed order.
 */
export interface Ids { ga4Id?: string | null; metaPixelId?: string | null }
export interface ConsentChoice { analytics: boolean; marketing: boolean }
export interface Item { item_id: string; item_name: string; price: number; quantity: number }
export type EventName = 'view_item' | 'add_to_cart' | 'begin_checkout' | 'add_payment_info' | 'purchase' | 'generate_lead';

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue: unknown[][]; loaded: boolean; version: string; push: unknown };
declare global {
  interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; fbq?: Fbq; _fbq?: Fbq; [flag: `ga-disable-${string}`]: boolean | undefined }
}

const META_EVENT: Record<EventName, string> = { view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', add_payment_info: 'AddPaymentInfo', purchase: 'Purchase', generate_lead: 'Contact' };
/** Google calls made before the (tiny) shim has loaded wait here, then run in order. */
const gaQueue: unknown[][] = [];
function gtagCall(...args: unknown[]): void {
  if (window.gtag) window.gtag(...args); else gaQueue.push(args);
}
const live = { ga: null as string | null, gaOn: false, fb: null as string | null, fbOn: false, gaPath: '', fbPath: '' };

function addScript(src: string, onload?: () => void) {
  const s = document.createElement('script');
  s.async = true; s.src = src; s.dataset['tracker'] = 'true';
  if (onload) s.onload = onload;
  document.head.appendChild(s);
}

function startGa(id: string) {
  live.ga = id;
  // shim first (defines gtag), then Google's library
  addScript('/ga-shim.js', () => {
    window.gtag?.('js', new Date());
    window.gtag?.('config', id, { send_page_view: false });
    for (const a of gaQueue.splice(0)) window.gtag?.(...a); // events that happened while it was loading
  });
  addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
}

function startFb(id: string) {
  live.fb = id;
  if (!window.fbq) {
    const q: Fbq = Object.assign((...args: unknown[]) => { if (q.callMethod) q.callMethod(...args); else q.queue.push(args); }, { queue: [] as unknown[][], loaded: true, version: '2.0', push: null as unknown });
    q.push = q;
    window.fbq = q; window._fbq ??= q;
    addScript('https://connect.facebook.net/en_US/fbevents.js');
  }
  window.fbq('init', id);
}

/** Starts, pauses or resumes each tool to match the visitor's current choice. Safe to call repeatedly. */
export function applyConsent(ids: Ids, consent: ConsentChoice | null): void {
  const ga = consent?.analytics ? ids.ga4Id ?? null : null;
  if (ga && !live.ga) startGa(ga);
  if (live.ga) { window[`ga-disable-${live.ga}`] = !ga; live.gaOn = Boolean(ga); if (!ga) gaQueue.length = 0; } // Google's documented opt-out switch
  const fb = consent?.marketing ? ids.metaPixelId ?? null : null;
  if (fb && !live.fb) startFb(fb);
  if (live.fb) { window.fbq?.('consent', fb ? 'grant' : 'revoke'); live.fbOn = Boolean(fb); }
}

/** SPA page view (once per path per tool). */
export function pageView(path: string): void {
  if (live.gaOn && live.gaPath !== path) { live.gaPath = path; gtagCall('event', 'page_view', { page_path: path, page_title: document.title }); }
  if (live.fbOn && live.fbPath !== path) { live.fbPath = path; window.fbq?.('track', 'PageView'); }
}

export function track(name: EventName, p: { items?: Item[]; value?: number; transaction_id?: string; payment_type?: string } = {}): void {
  const value = p.value ?? p.items?.reduce((s, i) => s + i.price * i.quantity, 0);
  if (live.gaOn) gtagCall('event', name, { currency: 'BDT', ...(value !== undefined ? { value } : {}), ...(p.items ? { items: p.items } : {}), ...(p.transaction_id ? { transaction_id: p.transaction_id } : {}), ...(p.payment_type ? { payment_type: p.payment_type } : {}) });
  if (live.fbOn) {
    window.fbq?.('track', META_EVENT[name], {
      ...(p.items ? { content_type: 'product', content_ids: p.items.map((i) => i.item_id), contents: p.items.map((i) => ({ id: i.item_id, quantity: i.quantity })), num_items: p.items.reduce((s, i) => s + i.quantity, 0) } : {}),
      ...(value !== undefined ? { value, currency: 'BDT' } : {}),
    });
  }
}

/** Resolves cart lines to named, priced items from the live catalogue. Prices here are for reporting only. */
export function itemsFor(lines: { productId: string; sku: string; qty: number }[]): Item[] {
  const products = useCatalog.getState().products;
  return lines.flatMap((l) => {
    const p = products.find((x) => x.id === l.productId);
    if (!p) return [];
    const v = p.variants.find((x) => x.sku === l.sku);
    return [{ item_id: l.sku, item_name: p.name, price: v?.price ?? p.price, quantity: l.qty }];
  });
}

const PURCHASED = 'bo-purchased-v1';
/** True the first time this order number is seen on this device; false afterwards (so one order = one purchase event). */
export function firstTimePurchase(orderNo: string): boolean {
  try {
    const seen = JSON.parse(window.localStorage.getItem(PURCHASED) ?? '[]') as string[];
    if (seen.includes(orderNo)) return false;
    window.localStorage.setItem(PURCHASED, JSON.stringify([orderNo, ...seen].slice(0, 50)));
    return true;
  } catch { return true; }
}

/** Only orders the shop has accepted count as purchases — not pending, cancelled or returned ones. */
export const COUNTS_AS_PURCHASE = ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'];

/** Test helper: forget what was started (a fresh page load starts clean). */
export function resetAnalyticsForTests(): void { gaQueue.length = 0;
  Object.assign(live, { ga: null, gaOn: false, fb: null, fbOn: false, gaPath: '', fbPath: '' }); }
