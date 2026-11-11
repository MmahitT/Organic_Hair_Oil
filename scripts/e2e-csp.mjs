// Runs the real customer and admin journeys in a browser UNDER the website's production Content-Security-Policy and fails
// on any violation. Also proves the policy is really enforced (inline script handlers and eval are blocked).
// Needs the site built and served by `vite preview` (which sends the policy headers), the API on :5001 with a FRESH
// throwaway database. Google/Meta requests are intercepted (never sent). Usage:
//   ADMIN_EMAIL=... ADMIN_PW=... node scripts/e2e-csp.mjs [siteUrl] [outDir]
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

// ---- the headers themselves
const home = await fetch(site);
const h = Object.fromEntries(home.headers.entries());
const csp = h['content-security-policy'] ?? '';
check('the site sends a Content-Security-Policy', csp.length > 50);
check('scripts are allowed only from this site, Google Tag Manager and Meta — never inline or eval', /script-src 'self' https:\/\/www\.googletagmanager\.com https:\/\/connect\.facebook\.net(;|$)/.test(csp) && !/script-src[^;]*unsafe/.test(csp));
check('no plugins, no framing, no base-tag or form hijacking', /object-src 'none'/.test(csp) && /frame-ancestors 'none'/.test(csp) && /base-uri 'self'/.test(csp) && /form-action 'self'/.test(csp));
check('other hardening headers are present', h['x-content-type-options'] === 'nosniff' && /strict-origin/.test(h['referrer-policy'] ?? '') && /camera=\(\)/.test(h['permissions-policy'] ?? '') && h['x-frame-options'] === 'DENY' && h['cross-origin-opener-policy'] === 'same-origin');

const T = (await call('/auth/admin/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PW } })).data.accessToken;
const products = (await call('/admin/products?limit=50', { token: T })).data.items;
const by = Object.fromEntries(products.map((p) => [p.slug, p]));
for (const p of products) await call(`/admin/products/${p._id}`, { method: 'PATCH', token: T, body: { visibility: 'published' } });
for (const s of ['hair-oil', 'hair-powder', 'wooden-comb']) await call(`/admin/inventory/${by[s]._id}/${by[s].variants[0].sku}`, { method: 'PATCH', token: T, body: { set: 20, note: 'e2e setup' } });
await call('/admin/settings/seo', { method: 'PUT', token: T, body: { title: '', description: '', titleBn: '', descriptionBn: '', ogImage: '', ga4Id: 'G-TEST123456', metaPixelId: '123456789012345' } });
await sleep(11000);

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const violations = [];
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
const fetched = [];
await ctx.route(/googletagmanager\.com|google-analytics\.com|facebook\.net|facebook\.com|wa\.me/, (route) => { fetched.push(route.request().url()); route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }); });
await ctx.addInitScript(() => {
  try { if (!localStorage.getItem('bo-lang')) localStorage.setItem('bo-lang', 'en'); } catch { /* */ }
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ← ${e.blockedURI || e.sample || 'inline'}`));
});
const page = await ctx.newPage();
const collect = async (p, label) => { for (const v of await p.evaluate(() => window.__csp ?? [])) violations.push(`${label}: ${v}`); await p.evaluate(() => { window.__csp = []; }); };
page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
let proving = false; // during the deliberate injection test the browser is EXPECTED to log refusals
page.on('console', (m) => { if (!proving && m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); if (!proving && /Content Security Policy/i.test(m.text())) violations.push(`console: ${m.text().slice(0, 200)}`); });

// ================= customer journey =================
await page.goto(site, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Accept all' }).click();
await sleep(1200);
check('after consent, Google and Meta scripts load under the policy (they are on the allow-list)', fetched.some((u) => /googletagmanager/.test(u)) && fetched.some((u) => /facebook/.test(u)));
await collect(page, 'landing');
await page.locator('#products').getByRole('button', { name: 'Add to cart' }).nth(1).click();
const drawer = page.getByRole('dialog', { name: 'Your cart' });
await drawer.waitFor();
await drawer.getByRole('button', { name: 'Checkout' }).click();
await page.waitForURL('**/checkout');
await page.getByLabel('Full name').fill('Karim Hossain');
await page.getByLabel('Mobile number').fill('01712340555');
await page.getByLabel('District').selectOption('Rangpur');
await page.getByLabel('City / Thana / Area').fill('Mirpur');
await page.getByLabel('Full address').fill('House 12, Road 5, Block C, Mirpur DOHS');
await page.getByRole('button', { name: /^Place order · ৳610/ }).last().waitFor();
await collect(page, 'checkout');
await page.getByRole('button', { name: /^Place order/ }).last().click();
await page.waitForURL(/\/order\/HO-/);
await page.getByTestId('order-no').waitFor();
await collect(page, 'order page');
const orderNo = (await page.getByTestId('order-no').innerText()).trim();
await page.goto(`${site}/track?order=${orderNo}`);
await page.getByLabel(/Mobile number/).fill('01712340555');
await page.getByRole('button', { name: 'Track order' }).click();
await page.getByTestId('track-status').waitFor();
await collect(page, 'track');
for (const path of ['/contact', '/privacy', '/shipping']) { await page.goto(`${site}${path}`, { waitUntil: 'networkidle' }); await collect(page, path); }
await page.goto(site, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Cookie settings' }).click();
await page.getByRole('dialog', { name: 'Cookies and tracking' }).waitFor();
await collect(page, 'cookie settings');
check('the customer journey (landing → cart → checkout → order → track → policies) triggers no policy violation', violations.length === 0, violations.slice(0, 3).join(' | '));

// ================= prove the policy is enforced =================
proving = true;
const proof = await page.evaluate(async () => {
  window.__csp = [];
  const d = document.createElement('div');
  d.innerHTML = '<img src="/favicon.png" onerror="window.__pwned=1">'; // inline event handler = inline script
  document.body.appendChild(d);
  const s = document.createElement('script'); s.textContent = 'window.__pwned2 = 1'; document.body.appendChild(s);
  const ext = document.createElement('script'); ext.src = 'https://evil.example/x.js'; document.body.appendChild(ext);
  await new Promise((r) => setTimeout(r, 400));
  return { pwned: window.__pwned, pwned2: window.__pwned2, violations: window.__csp.length };
});
check('the website needs no eval at all (no "unsafe-eval" in the policy and no violation during the journeys above)', !/unsafe-eval/.test(csp) && !violations.some((v) => /eval/.test(v)));
check('an injected inline script and inline event handler do NOT run', proof.pwned === undefined && proof.pwned2 === undefined);
proving = false;
check('a script from an unknown site is refused', proof.violations >= 2, `${proof.violations} violations recorded`);

// ================= admin journey =================
const actx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
await actx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ← ${e.blockedURI || e.sample || 'inline'}`)); });
const ap = await actx.newPage();
ap.on('pageerror', (e) => errors.push(`admin pageerror: ${e}`));
ap.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(`admin console: ${m.text().slice(0, 200)}`); if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`admin console: ${m.text()}`); });
const adminViolationsBefore = violations.length;
await ap.goto(`${site}/admin/login`);
await ap.getByLabel('Email').fill(ADMIN_EMAIL); await ap.getByLabel('Password').fill(ADMIN_PW);
await ap.getByRole('button', { name: 'Sign in' }).click();
await ap.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
await collect(ap, 'dashboard');
for (const [name, heading] of [['Orders', 'Orders'], ['Payments', 'Payments'], ['Customers', 'Customers'], ['Website', 'Website'], ['Inventory', 'Inventory'], ['Products', 'Products']]) {
  await ap.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: new RegExp(`^${name}`) }).click();
  await ap.getByRole('heading', { name: heading, exact: true }).waitFor();
  await ap.waitForLoadState('networkidle');
  await collect(ap, `admin ${name}`);
}
await ap.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: /^Orders/ }).click();
await ap.getByRole('link', { name: orderNo }).click();
await ap.getByRole('heading', { name: orderNo }).waitFor();
const [invoice] = await Promise.all([actx.waitForEvent('page'), ap.getByRole('button', { name: 'Invoice (print / PDF)' }).click()]);
await invoice.waitForLoadState();
check('the printable invoice opens and shows the order under the policy', (await invoice.locator('body').innerText()).includes(orderNo));
await invoice.close();
await collect(ap, 'order detail');
check('the admin journey (dashboard → orders → payments → customers → website → inventory → products → invoice) triggers no policy violation', violations.length === adminViolationsBefore, violations.slice(adminViolationsBefore, adminViolationsBefore + 3).join(' | '));
check('no unexpected browser errors', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
