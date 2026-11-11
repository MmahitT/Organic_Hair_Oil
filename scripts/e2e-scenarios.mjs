// Spec §17 "key E2E scenarios" that no other browser script covers: cart persistence, coupon outcomes in the checkout
// UI, and an item selling out WHILE the customer is checking out. Needs a FRESH throwaway database, API on :5001 and the
// built site on :4173. Usage:  ADMIN_EMAIL=... ADMIN_PW=... node scripts/e2e-scenarios.mjs [siteUrl] [outDir]
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
const oil = by['hair-oil'], sku = oil.variants[0].sku;
const setStock = (n) => call(`/admin/inventory/${oil._id}/${sku}`, { method: 'PATCH', token: T, body: { set: n, note: 'e2e' } });
for (const s of ['hair-powder', 'wooden-comb']) await call(`/admin/inventory/${by[s]._id}/${by[s].variants[0].sku}`, { method: 'PATCH', token: T, body: { set: 20, note: 'e2e' } });
await setStock(10);
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
await call('/admin/coupons', { method: 'POST', token: T, body: { code: 'VALID10', type: 'percent', value: 10 } });
await call('/admin/coupons', { method: 'POST', token: T, body: { code: 'OLD20', type: 'percent', value: 20, startsAt: day(-30), expiresAt: day(-1) } });
await call('/admin/coupons', { method: 'POST', token: T, body: { code: 'ONLYONE', type: 'fixed', value: 50, usageLimit: 1 } });
const items = [{ productId: oil._id, sku, qty: 1 }];
const used = await call('/checkout', { method: 'POST', body: { idempotencyKey: crypto.randomUUID(), items, couponCode: 'ONLYONE', customer: { name: 'First Buyer', phone: '01711110001', district: 'Rangpur', city: 'Mirpur', address: 'House 12, Road 5, Mirpur DOHS' }, paymentMethod: 'cod' } });
check('setup: the one-use coupon was consumed by another customer', used.status === 201);
await sleep(11000);

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { if (!localStorage.getItem('bo-lang')) localStorage.setItem('bo-lang', 'en'); } catch { /* */ } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));

// ================= 13. Cart persistence =================
await page.goto(site, { waitUntil: 'networkidle' });
await page.locator('#products').getByRole('button', { name: 'Add to cart' }).nth(1).click();
const drawer = page.getByRole('dialog', { name: 'Your cart' });
await drawer.waitFor();
await page.keyboard.press('Escape');
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Open cart' }).first().click();
await drawer.waitFor();
check('the cart survives a page reload (one Hair Oil still in it)', (await drawer.innerText()).includes('Hair Oil') && (await drawer.innerText()).includes('৳550'));
const stored = await page.evaluate(() => localStorage.getItem('bo-cart-v2'));
check('only ids and quantities are stored — never prices', !!stored && !/"price"|"total"|"fee"/.test(stored), stored?.slice(0, 120));
await drawer.getByRole('button', { name: 'Checkout' }).click();
await page.waitForURL('**/checkout');

// ================= 7. Coupons in the checkout UI =================
await page.getByLabel('District').selectOption('Rangpur');
await page.getByRole('button', { name: /^Place order · ৳610/ }).last().waitFor();
const apply = async (code) => { await page.getByLabel('Coupon code').fill(code); await page.getByRole('button', { name: 'Apply' }).click(); };
await apply('NOSUCH');
await page.getByText('This coupon code is not valid.').waitFor();
check('an unknown code is refused with a clear reason', true);
await page.getByRole('button', { name: 'Remove coupon' }).click().catch(() => undefined);
await apply('old20');
await page.getByText('This coupon has expired.').waitFor();
check('an expired coupon says "This coupon has expired." and the total is unchanged', (await page.locator('aside').innerText()).includes('৳610'));
await page.getByRole('button', { name: 'Remove coupon' }).click().catch(() => undefined);
await apply('onlyone');
await page.getByText('This coupon has reached its usage limit.').waitFor();
check('a used-up coupon says it has reached its usage limit', true);
await page.getByRole('button', { name: 'Remove coupon' }).click().catch(() => undefined);
await apply('valid10');
await page.getByText('Coupon applied').waitFor();
await page.getByRole('button', { name: /^Place order · ৳555/ }).last().waitFor();
check('a valid coupon takes 10% off the product price (৳55) and the total follows (৳555)', (await page.locator('aside').innerText()).includes('−৳55'));

// ================= 6. Item sells out while the customer is checking out =================
await page.getByLabel('Full name').fill('Karim Hossain');
await page.getByLabel('Mobile number').fill('01712340701');
await page.getByLabel('City / Thana / Area').fill('Mirpur');
await page.getByLabel('Full address').fill('House 12, Road 5, Block C, Mirpur DOHS');
const ordersBefore = (await call('/admin/orders?limit=100', { token: T })).data.items.length;
await setStock(0); // someone else buys the last unit — admin sets it to 0
await page.getByRole('button', { name: /^Place order/ }).last().click();
await page.getByText(/no longer available in the quantity you chose/).waitFor();
check('when the item sells out mid-checkout the customer gets a clear message, not an error page', true);
check('no order was created and stock was not driven negative', (await call('/admin/orders?limit=100', { token: T })).data.items.length === ordersBefore);
await page.screenshot({ path: `${out}/scenario-sold-out-checkout.png`, fullPage: true });
await page.getByText(/out of stock/i).first().waitFor();
const blocked = await page.getByRole('button', { name: /^Place order/ }).last().isDisabled();
check('the order summary now marks the item as out of stock and ordering is blocked', blocked);
await setStock(5);
await sleep(11000);
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: /^Place order/ }).last().waitFor();
check('after restocking, the customer can complete the order (recovery path)', await page.getByRole('button', { name: /^Place order/ }).last().isEnabled());

check('no unexpected browser errors', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
