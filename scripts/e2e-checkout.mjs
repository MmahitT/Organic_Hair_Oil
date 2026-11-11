// End-to-end Phase 5 check: a customer buys with Cash on Delivery on a phone-sized screen; the admin then sees the order.
// Needs the stack running (API :5001, site :4173) against a THROWAWAY database. Usage:
//   ADMIN_EMAIL=... ADMIN_PW=... node scripts/e2e-checkout.mjs [siteUrl] [outDir]
import { chromium } from 'playwright-core';

const site = process.argv[2] ?? 'http://localhost:4173';
const out = process.argv[3] ?? '.';
const { ADMIN_EMAIL, ADMIN_PW } = process.env;
let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) failed++; };

// ---------- API helpers (admin setup + verification) ----------
const call = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(`${site}/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = res.status === 204 ? {} : await res.json();
  return { status: res.status, ...json };
};
const login = await call('/auth/admin/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PW } });
const T = login.data.accessToken;
const adminList = (await call('/admin/products?limit=50', { token: T })).data.items;
const bySlug = Object.fromEntries(adminList.map((p) => [p.slug, p]));
for (const p of adminList) await call(`/admin/products/${p._id}`, { method: 'PATCH', token: T, body: { visibility: 'published' } });
const stockOf = async (slug) => (await call('/admin/inventory', { token: T })).data.items.find((i) => i.productId === bySlug[slug]._id).stock;
const setStock = (slug, set) => call(`/admin/inventory/${bySlug[slug]._id}/${bySlug[slug].variants[0].sku}`, { method: 'PATCH', token: T, body: { set, note: 'e2e setup' } });
for (const s of ['hair-oil', 'hair-powder', 'wooden-comb']) await setStock(s, 5);
await call('/admin/coupons', { method: 'POST', token: T, body: { code: 'SAVE10', type: 'percent', value: 10, usageLimit: 3, perCustomerLimit: 1 } });
await new Promise((r) => setTimeout(r, 11000)); // public catalogue responses are cached for 10s

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const errors = [];
const newPhone = async (lang = 'en') => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript((l) => { try { if (!localStorage.getItem('bo-lang')) localStorage.setItem('bo-lang', l); } catch { /* */ } }, lang);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push('console: ' + m.text()));
  return { ctx, page };
};

// ================= 1. Cart drawer shows SERVER prices =================
const { ctx, page } = await newPhone('en');
await page.goto(site, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Order now', exact: true }).last().click();
const drawer = page.getByRole('dialog', { name: 'Your cart' });
await drawer.waitFor();
await drawer.getByText('৳999').first().waitFor();
let txt = (await drawer.innerText()).replace(/\s+/g, ' ');
check('drawer: combo ৳999 with free delivery (server quote)', txt.includes('৳999') && txt.includes('Free'), txt.slice(0, 120));
// add a single oil (550) -> combo still present => still free delivery, total 1549
await page.keyboard.press('Escape');
await page.locator('#products').getByRole('button', { name: 'Add to cart' }).nth(1).click(); // cards: combo (featured) first, then oil, powder, comb
await drawer.waitFor();
await drawer.getByText('৳1,549').first().waitFor();
check('drawer: combo + oil = ৳1,549, delivery stays free', true);
// remove the combo: oil alone pays delivery by zone
await drawer.getByRole('button', { name: /^Remove: Combo/ }).click();
await drawer.getByText('৳670').first().waitFor(); // default zone outside Rangpur: 550 + 120
check('drawer: oil alone, outside Rangpur = ৳670', true);
await drawer.getByText('Inside Rangpur').click();
await drawer.getByText('৳610').first().waitFor();
check('drawer: switching to Inside Rangpur = ৳610', true);

// ================= 2. Checkout form, validation, coupon =================
await drawer.getByRole('button', { name: 'Checkout' }).click();
await page.waitForURL('**/checkout');
await page.getByRole('heading', { name: 'Order summary' }).waitFor();
await page.getByRole('button', { name: /^Place order/ }).click();
check('empty form shows inline errors', await page.getByText('Enter a valid Bangladeshi mobile number, e.g. 01712345678.').isVisible());
await page.getByLabel('Full name').fill('Karim Hossain');
await page.getByLabel('Mobile number').fill('12345');
await page.getByLabel('Full address').fill('short');
await page.getByRole('button', { name: /^Place order/ }).click();
check('bad phone / short address are rejected client-side', await page.getByText('Enter a valid Bangladeshi mobile number, e.g. 01712345678.').isVisible() && await page.getByText('Please write your full address (at least 10 characters).').isVisible());
await page.getByLabel('Mobile number').fill('+8801712345601');
await page.getByLabel('District').selectOption('Rangpur');
await page.getByLabel('City / Thana / Area').fill('Mirpur');
await page.getByLabel('Full address').fill('House 12, Road 5, Block C, Mirpur DOHS');
await page.getByLabel('Delivery instructions (optional)').fill('Call before delivery');
await page.getByText('৳610').first().waitFor();
check('summary re-prices from the server after choosing Rangpur (৳610)', true);
await page.getByLabel('Coupon code').fill('nope123'); await page.getByRole('button', { name: 'Apply' }).click();
await page.getByText('This coupon code is not valid.').waitFor();
check('invalid coupon shows its reason; total unchanged', (await page.locator('aside').innerText()).includes('৳610'));
await page.getByRole('button', { name: 'Remove coupon' }).click();
await page.getByLabel('Coupon code').fill('save10'); await page.getByRole('button', { name: 'Apply' }).click();
await page.getByText('Coupon applied').waitFor();
await page.getByText('৳555').first().waitFor();
check('coupon SAVE10 applied: −৳55, total ৳555', (await page.locator('aside').innerText()).includes('−৳55'));
await page.screenshot({ path: `${out}/checkout-mobile.png`, fullPage: true });

// ================= 3. Place the order =================
await page.getByRole('button', { name: /^Place order/ }).click();
await page.waitForURL('**/order/HO-*');
const orderNo = (await page.getByTestId('order-no').innerText()).trim();
check('order placed → confirmation page with order number', /^HO-\d{6}-[A-Z0-9]{5}$/.test(orderNo), orderNo);
const conf = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
check('confirmation shows total ৳555, COD note, masked phone, district', conf.includes('৳555') && conf.includes('Cash on Delivery') && conf.includes('017*****601') && conf.includes('Rangpur'));
check('confirmation does NOT show the street address, full phone or email', !conf.includes('Block C') && !conf.includes('01712345601'));
check('token is removed from the URL after loading', !page.url().includes('#t='));
await page.screenshot({ path: `${out}/order-confirmation.png`, fullPage: true });
await page.reload({ waitUntil: 'networkidle' });
check('confirmation survives a reload', (await page.getByTestId('order-no').innerText()).trim() === orderNo);
await page.goto(site, { waitUntil: 'networkidle' });
check('cart is empty after ordering', (await page.getByRole('button', { name: 'Open cart' }).innerText()).trim() === '');
// a different browser (no token) cannot see the order
const other = await newPhone('en');
await other.page.goto(`${site}/order/${orderNo}`, { waitUntil: 'networkidle' });
check('opening the order link without the token shows a safe "cannot show" page', await other.page.getByText('We can’t show this order here').isVisible());
await other.ctx.close();

// ================= 4. Server-side effects =================
check('stock of oil dropped by 1 (5 → 4)', (await stockOf('hair-oil')) === 4);
const orders = (await call('/admin/orders', { token: T })).data.items;
const mine = orders.find((o) => o.orderNo === orderNo);
check('admin API lists the order with COD pending and the coupon snapshot', mine && mine.paymentStatus === 'cod_pending' && mine.total === 555 && mine.coupon.code === 'SAVE10');
const coupon = (await call('/admin/coupons', { token: T })).data.items.find((c) => c.code === 'SAVE10');
check('coupon usedCount is now 1', coupon.usedCount === 1);

// ================= 5. Duplicate protection (same phone + same cart) =================
const dupe = await newPhone('en');
await dupe.page.goto(site, { waitUntil: 'networkidle' });
await dupe.page.locator('#products').getByRole('button', { name: 'Add to cart' }).nth(1).click();
await dupe.page.getByRole('dialog', { name: 'Your cart' }).getByRole('button', { name: 'Checkout' }).click();
await dupe.page.waitForURL('**/checkout');
await dupe.page.getByLabel('Full name').fill('Karim Hossain');
await dupe.page.getByLabel('Mobile number').fill('01712345601');
await dupe.page.getByLabel('District').selectOption('Rangpur');
await dupe.page.getByLabel('City / Thana / Area').fill('Mirpur');
await dupe.page.getByLabel('Full address').fill('House 12, Road 5, Block C, Mirpur DOHS');
await dupe.page.getByText('৳610').first().waitFor();
await dupe.page.getByRole('button', { name: /^Place order/ }).click();
await dupe.page.getByText('Order already placed?').waitFor();
check('identical order from the same phone is held with a clear question (mentions the first order)', (await dupe.page.locator('main').innerText()).includes(orderNo));
check('no second order or stock change yet', (await stockOf('hair-oil')) === 4 && (await call('/admin/orders', { token: T })).data.items.length === 1);
await dupe.page.getByRole('button', { name: 'This is a new order — place it anyway' }).click();
await dupe.page.waitForURL('**/order/HO-*');
check('after confirming, the second order is created', (await call('/admin/orders', { token: T })).data.items.length === 2 && (await stockOf('hair-oil')) === 3);
await dupe.ctx.close();

// ================= 6. Stock changes under the customer =================
const race = await newPhone('en');
await race.page.goto(site, { waitUntil: 'networkidle' });
await race.page.locator('#products').getByRole('button', { name: 'Add to cart' }).nth(3).click(); // comb
const rd = race.page.getByRole('dialog', { name: 'Your cart' });
await rd.getByRole('button', { name: 'Increase quantity' }).click();
await rd.getByRole('button', { name: 'Increase quantity' }).click();
await rd.getByText('৳450').first().waitFor(); // 3 combs
await setStock('wooden-comb', 1); // someone else bought them
await rd.getByRole('button', { name: 'Checkout' }).click();
await race.page.waitForURL('**/checkout');
await race.page.getByText('Only 1 available — quantity reduced.').waitFor();
check('checkout reduces the quantity to what is really in stock and says so', true);
await setStock('wooden-comb', 0);
await race.page.reload({ waitUntil: 'networkidle' });
await race.page.getByText(/Out of stock — please remove/).waitFor();
check('out-of-stock line blocks the order button', await race.page.getByRole('button', { name: /^Place order/ }).isDisabled());
await race.ctx.close();

// ================= 7. Tampering is useless =================
const prod = bySlug['hair-oil'];
const tamperQuote = await call('/cart/quote', { method: 'POST', body: { items: [{ productId: prod._id, sku: prod.variants[0].sku, qty: 1, unitPrice: 1 }], district: 'Rangpur', total: 1 } });
check('quote ignores client-supplied prices', tamperQuote.data.total === 610);
const tamperOrder = await call('/checkout', { method: 'POST', body: { idempotencyKey: crypto.randomUUID(), items: [{ productId: prod._id, sku: prod.variants[0].sku, qty: 1 }], customer: { name: 'Tamper Test', phone: '01899887766', district: 'Rangpur', city: 'Mirpur', address: 'House 1, Road 1, Mirpur DOHS' }, paymentMethod: 'cod', expectedTotal: 1 } });
check('a forged expectedTotal is rejected with PRICE_CHANGED and nothing is created', tamperOrder.status === 409 && tamperOrder.error.code === 'PRICE_CHANGED' && (await call('/admin/orders', { token: T })).data.items.length === 2);

// ================= 8. Bangla =================
const bn = await newPhone('bn');
await bn.page.goto(site, { waitUntil: 'networkidle' });
await bn.page.locator('#products').getByRole('button', { name: 'কার্টে যোগ করুন' }).nth(1).click();
await bn.page.getByRole('dialog').getByRole('button', { name: 'চেকআউট' }).click();
await bn.page.waitForURL('**/checkout');
await bn.page.getByRole('button', { name: /^অর্ডার করুন/ }).click();
check('Bangla validation messages', await bn.page.getByText('সঠিক বাংলাদেশি মোবাইল নম্বর লিখুন, যেমন: 01712345678।').isVisible());
await bn.ctx.close();

// ================= 9. Admin sees the order =================
const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const ap = await adminCtx.newPage();
ap.on('pageerror', (e) => errors.push('admin pageerror: ' + e));
await ap.goto(`${site}/admin/login`);
await ap.getByLabel('Email').fill(ADMIN_EMAIL); await ap.getByLabel('Password').fill(ADMIN_PW);
await ap.getByRole('button', { name: 'Sign in' }).click();
await ap.waitForURL('**/admin/dashboard');
await ap.goto(`${site}/admin/orders`);
await ap.getByRole('link', { name: orderNo }).waitFor();
check('admin Orders list shows the new order', true);
await ap.getByLabel('Search orders').fill('01712345601');
await ap.waitForTimeout(600);
check('admin can find orders by phone', (await ap.locator('tbody tr').count()) === 2);
await ap.getByRole('link', { name: orderNo }).click();
await ap.getByRole('heading', { name: orderNo }).waitFor();
const detail = (await ap.locator('main').innerText()).replace(/\s+/g, ' ');
check('admin order page: full address, instructions, coupon, packing list', detail.includes('Block C') && detail.includes('Call before delivery') && detail.includes('SAVE10') && detail.includes('Pack: 1 × Hair Oil'));
await ap.screenshot({ path: `${out}/admin-order.png`, fullPage: true });

check('no unexpected console/page errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);
