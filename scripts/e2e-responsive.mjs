// Responsive check (spec §17): every key page at 360 / 390 / 768 / 1024 / 1280 px wide must fit the screen (no sideways
// scroll), render without console errors, and keep controls reachable. Covers the storefront AND the admin (the owner
// will use the admin on a phone). Needs the site built + served on :4173, API on :5001 with a FRESH throwaway database
// (restart the API first: the admin-login rate limit allows 8 sign-ins per 15 minutes). Usage:
//   ADMIN_EMAIL=... ADMIN_PW=... node scripts/e2e-responsive.mjs [siteUrl] [outDir]
import { chromium } from 'playwright-core';

const site = process.argv[2] ?? 'http://localhost:4173';
const out = process.argv[3] ?? '.';
const { ADMIN_EMAIL, ADMIN_PW } = process.env;
let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(`${site}/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
};
const T = (await call('/auth/admin/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PW } })).data.accessToken;
const products = (await call('/admin/products?limit=50', { token: T })).data.items;
const by = Object.fromEntries(products.map((p) => [p.slug, p]));
for (const p of products) await call(`/admin/products/${p._id}`, { method: 'PATCH', token: T, body: { visibility: 'published' } });
for (const s of ['hair-oil', 'hair-powder', 'wooden-comb']) await call(`/admin/inventory/${by[s]._id}/${by[s].variants[0].sku}`, { method: 'PATCH', token: T, body: { set: 30, note: 'e2e setup' } });
await call('/admin/settings/payments', { method: 'PATCH', token: T, body: { bank: { enabled: true, bankName: 'Example Bank', accountName: 'Test Business', accountNumber: '1234-567-890', branch: 'Dhanmondi', instructions: 'Use the order number as the reference.' } } });
// a COD order and a bank-transfer order (for the order page, order detail and payments table)
const mk = async (phone, method) => (await call('/checkout', { method: 'POST', body: { idempotencyKey: crypto.randomUUID(), items: [{ productId: by['hair-oil']._id, sku: by['hair-oil'].variants[0].sku, qty: 2 }], customer: { name: 'Karim Hossain', phone, district: 'Rangpur', city: 'Mirpur', address: 'House 12, Road 5, Block C, Mirpur DOHS', email: 'karim@example.com' }, paymentMethod: method, allowDuplicate: true } })).data;
const cod = await mk('01712340601', 'cod');
const bank = await mk('01712340602', 'manual_bank');
await call('/payments/manual/submit', { method: 'POST', body: { orderNo: bank.orderNo, token: bank.orderToken, trxId: 'TRF000777', senderName: 'Karim Hossain', reference: 'City Bank 12 Nov' } });
await call('/contact', { method: 'POST', body: { name: 'Rahim', phone: '01712340603', message: 'Is this suitable for dry hair?' } });
await sleep(11000);

const WIDTHS = [360, 390, 768, 1024, 1280];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const errors = [];
const fits = (page) => page.evaluate(() => ({ ok: document.documentElement.scrollWidth <= window.innerWidth + 1, scroll: document.documentElement.scrollWidth, width: window.innerWidth }));

const PUBLIC = [
  ['landing', '/', async (p) => { await p.locator('#products').scrollIntoViewIfNeeded(); }],
  ['track', '/track', async () => {}],
  ['contact', '/contact', async () => {}],
  ['privacy policy', '/privacy', async (p) => { await p.getByRole('heading', { name: 'Privacy Policy' }).first().waitFor(); }],
  ['shipping policy', '/shipping', async (p) => { await p.getByRole('heading', { name: 'Shipping & Delivery Policy' }).first().waitFor(); }],
  ['COD order page', `/order/${cod.orderNo}#t=${cod.orderToken}`, async (p) => { await p.getByTestId('order-no').waitFor(); }],
  ['bank-transfer order page', `/order/${bank.orderNo}#t=${bank.orderToken}`, async (p) => { await p.getByTestId('order-no').waitFor(); }],
];
const ADMIN = [
  ['dashboard', '/admin/dashboard', 'Dashboard'], ['orders', '/admin/orders', 'Orders'], ['payments', '/admin/payments', 'Payments'], ['customers', '/admin/customers', 'Customers'],
  ['inventory', '/admin/inventory', 'Inventory'], ['products', '/admin/products', 'Products'], ['reviews', '/admin/reviews', 'Reviews'], ['messages', '/admin/messages', 'Messages'],
  ['coupons', '/admin/coupons', 'Coupons'], ['website settings', '/admin/website', 'Website'], ['team', '/admin/team', 'Team'], ['activity log', '/admin/activity', 'Activity log'],
];

for (const width of WIDTHS) {
  const height = width >= 1024 ? 800 : 844;
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 768, hasTouch: width < 1024 });
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('bo-lang')) localStorage.setItem('bo-lang', 'en'); } catch { /* */ } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${width}px pageerror: ${e}`));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`${width}px console: ${m.text()}`));
  const bad = [];

  for (const [name, path, ready] of PUBLIC) {
    await page.goto(`${site}${path}`, { waitUntil: 'networkidle' });
    try { await ready(page); } catch { bad.push(`${name} did not load: "${(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 140)}"`); continue; }
    const f = await fits(page);
    if (!f.ok) bad.push(`${name} (${f.scroll}px > ${f.width}px)`);
  }
  // checkout with items in the cart, and with the bank-transfer details open
  await page.goto(site, { waitUntil: 'networkidle' });
  await page.locator('#products').getByRole('button', { name: 'Add to cart' }).nth(1).click();
  const drawer = page.getByRole('dialog', { name: 'Your cart' });
  await drawer.waitFor();
  const df = await fits(page);
  if (!df.ok) bad.push(`cart drawer (${df.scroll}px)`);
  await drawer.getByRole('button', { name: 'Checkout' }).click();
  await page.waitForURL('**/checkout');
  await page.getByRole('radio', { name: /Bank transfer/ }).check();
  await page.getByTestId('payment-details').waitFor();
  const cf = await fits(page);
  if (!cf.ok) bad.push(`checkout (${cf.scroll}px)`);
  const place = page.getByRole('button', { name: /^Place order/ }).last();
  const box = await place.boundingBox();
  if (!box || box.height < 44) bad.push(`checkout button too small (${box?.height}px)`);
  if (width === 360) await page.screenshot({ path: `${out}/responsive-checkout-360.png`, fullPage: true });
  check(`storefront fits ${width}px: landing, track, contact, policies, order pages, cart, checkout`, bad.length === 0, bad.join(', '));

  // ---- admin
  const abad = [];
  await page.goto(`${site}/admin/login`);
  await page.getByLabel('Email').fill(ADMIN_EMAIL); await page.getByLabel('Password').fill(ADMIN_PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
  // Navigate with the menu (as a person does). Reloading each URL would call the sign-in refresh endpoint every time and
  // correctly trip its 20-per-15-minutes rate limit.
  for (const [name, , heading] of ADMIN) {
    await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: new RegExp(`^${heading}`) }).click();
    await page.getByRole('heading', { name: heading, exact: true }).first().waitFor();
    await page.waitForLoadState('networkidle');
    const f = await fits(page);
    if (!f.ok) abad.push(`${name} (${f.scroll}px > ${f.width}px)`);
    if (width === 360 && ['dashboard', 'orders', 'website settings'].includes(name)) await page.screenshot({ path: `${out}/responsive-admin-${name.replace(/ /g, '-')}-360.png`, fullPage: true });
  }
  // an order detail page and the payments table with a pending bank claim
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: /^Orders/ }).click();
  await page.getByRole('link', { name: bank.orderNo }).click();
  await page.getByRole('heading', { name: bank.orderNo }).waitFor();
  const of = await fits(page);
  if (!of.ok) abad.push(`order detail (${of.scroll}px)`);
  check(`admin fits ${width}px: ${ADMIN.length} screens + order detail`, abad.length === 0, abad.join(', '));
  await ctx.close();
}
check('no unexpected browser errors at any size', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
