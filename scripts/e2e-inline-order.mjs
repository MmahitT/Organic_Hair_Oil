// The order section on the landing page: pick products, fill the form and place a COD order without leaving the page.
// Needs a FRESH throwaway database (the runner provides one). Usage: ADMIN_EMAIL=... ADMIN_PW=... node scripts/e2e-inline-order.mjs [siteUrl] [outDir]
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
for (const p of products) await call(`/admin/inventory/${p._id}/${p.variants[0].sku}`, { method: 'PATCH', token: T, body: { set: 20, note: 'e2e' } });
await sleep(11000);

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem('bo-lang', 'en'); } catch { /* */ } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));

await page.goto(site, { waitUntil: 'networkidle' });
const order = page.locator('#order');
await order.scrollIntoViewIfNeeded();
const text0 = await order.innerText();
check('the order section shows every product with its price', ['৳550', '৳500', '৳150', '৳999'].every((x) => text0.includes(x)), text0.slice(0, 200));
check('with an empty cart it asks the customer to pick a product', (await order.innerText()).includes('Add a product above'));
const oilBtn = order.getByRole('button', { name: /^Add: Hair Oil/ }).first();
await oilBtn.click();
await order.getByRole('button', { name: /^Add: Hair Powder/ }).first().click();
await order.getByLabel('Full name').waitFor();
check('adding a product shows the order form on the same page (no navigation)', new URL(page.url()).pathname === '/');
await page.getByRole('button', { name: 'Open cart' }).first().click();
await page.getByRole('dialog', { name: 'Your cart' }).waitFor();
check('the same cart is available in the cart drawer', (await page.getByRole('dialog', { name: 'Your cart' }).innerText()).includes('Hair Powder'));
await page.keyboard.press('Escape');

await order.getByLabel('Full name').fill('Karim Hossain');
await order.getByLabel('Mobile number').fill('01712340801');
await order.getByLabel('District').selectOption('Rangpur');
await order.getByLabel('City / Thana / Area').fill('Dhap');
await order.getByLabel('Full address').fill('House 12, Road 5, Dhap, Rangpur');
await order.getByRole('button', { name: /^Place order · ৳1,110/ }).last().waitFor(); // 550 + 500 + 60 inside Rangpur
check('inside Rangpur the server charges ৳60 delivery (550 + 500 + 60 = ৳1,110)', true);
await order.getByLabel('District').selectOption('Sylhet');
await order.getByRole('button', { name: /^Place order · ৳1,170/ }).last().waitFor(); // outside = 120
check('outside Rangpur the server charges ৳120 delivery (৳1,170)', true);
// replace with the combo: free delivery everywhere
await order.getByRole('button', { name: /^Remove: Hair Oil/ }).click();
await order.getByRole('button', { name: /^Remove: Hair Oil/ }).waitFor({ state: 'detached' });
await order.getByRole('button', { name: /^Remove: Hair Powder/ }).click();
await order.getByRole('button', { name: /^Remove: Hair Powder/ }).waitFor({ state: 'detached' });
await order.getByRole('button', { name: /^Add: .*Combo/ }).first().click();
await order.getByRole('button', { name: /^Place order · ৳999/ }).last().waitFor({ timeout: 8000 }).catch(async (e) => { console.log('DEBUG', (await order.innerText()).replace(/\s+/g, ' ').slice(0, 1500)); throw e; });
check('the combo costs ৳999 with free delivery all over Bangladesh', (await order.innerText()).includes('Free'));
await page.screenshot({ path: `${out}/inline-order-390.png`, fullPage: false });
await order.getByRole('button', { name: /^Place order/ }).last().click();
await page.waitForURL(/\/order\/HO-/);
await page.getByTestId('order-no').waitFor();
const orderNo = (await page.getByTestId('order-no').innerText()).trim();
const adminOrder = (await call(`/admin/orders?search=${orderNo}`, { token: T })).data.items.find((o) => o.orderNo === orderNo);
check('the order was created from the landing page: COD, ৳999 total, free delivery', adminOrder?.total === 999 && adminOrder?.paymentMethod === 'cod' && adminOrder?.deliveryFee === 0, JSON.stringify({ t: adminOrder?.total, m: adminOrder?.paymentMethod }));
check('no unexpected browser errors', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
