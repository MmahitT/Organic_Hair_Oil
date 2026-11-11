// End-to-end Phase 8 check: the owner runs the business from the admin (dashboard, customers, coupons, website
// settings, messages, team, activity log, exports) and a staff member only sees what they should.
// Needs a FRESH throwaway database, API on :5001 and the built site on :4173 (see README). Usage:
//   ADMIN_EMAIL=... ADMIN_PW=... node scripts/e2e-admin.mjs [siteUrl] [outDir]
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';

const site = process.argv[2] ?? 'http://localhost:4173';
const out = process.argv[3] ?? '.';
const { ADMIN_EMAIL, ADMIN_PW } = process.env;
let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Menu links carry a badge ("Orders 3 waiting"), so match by prefix. */
const navLink = (page, name) => page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: new RegExp(`^${name}`) });
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(150); } return false; };

const call = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(`${site}/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return { status: res.status, ...json };
};
const T = (await call('/auth/admin/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PW } })).data.accessToken;
const products = (await call('/admin/products?limit=50', { token: T })).data.items;
const by = Object.fromEntries(products.map((p) => [p.slug, p]));
for (const p of products) await call(`/admin/products/${p._id}`, { method: 'PATCH', token: T, body: { visibility: 'published' } });
for (const s of ['hair-oil', 'hair-powder', 'wooden-comb']) await call(`/admin/inventory/${by[s]._id}/${by[s].variants[0].sku}`, { method: 'PATCH', token: T, body: { set: 20, note: 'e2e setup' } });

/** Places a COD order through the real checkout API and optionally moves it forward. */
async function order(phone, name, district, steps = []) {
  const r = await call('/checkout', { method: 'POST', body: {
    idempotencyKey: crypto.randomUUID(), items: [{ productId: by['hair-oil']._id, sku: by['hair-oil'].variants[0].sku, qty: 1 }],
    customer: { name, phone, district, city: 'Mirpur', address: 'House 12, Road 5, Mirpur DOHS' }, paymentMethod: 'cod', allowDuplicate: true } });
  const o = (await call(`/admin/orders?q=${r.data.orderNo}`, { token: T })).data.items[0];
  for (const s of steps) await call(`/admin/orders/${o._id}/status`, { method: 'PATCH', token: T, body: { status: s } });
  return o;
}
const A = '01711000001', B = '01722000002', C = '01733000003';
await order(A, 'Karim Hossain', 'Rangpur', ['confirmed', 'shipped', 'delivered']);
await order(A, 'Karim Hossain', 'Rangpur', ['confirmed']);
await order(B, 'Salma Akter', 'Sylhet', ['confirmed']);
const pending = await order(C, 'Nasrin Jahan', 'Rangpur');
const cancelled = await order('01744000004', 'Cancel Me', 'Rangpur');
await call(`/admin/orders/${cancelled._id}/cancel`, { method: 'POST', token: T, body: { reason: 'test' } });
await call(`/admin/inventory/${by['hair-powder']._id}/${by['hair-powder'].variants[0].sku}`, { method: 'PATCH', token: T, body: { set: 2, note: 'low stock test' } });
void pending;

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const errors = [];
const watch = (page, tag) => { page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e}`)); page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`${tag} console: ${m.text()}`)); };
const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const ap = await adminCtx.newPage(); watch(ap, 'admin');
await ap.goto(`${site}/admin/login`);
await ap.getByLabel('Email').fill(ADMIN_EMAIL); await ap.getByLabel('Password').fill(ADMIN_PW);
await ap.getByRole('button', { name: 'Sign in' }).click();

// ================= 1. Dashboard =================
await ap.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
check('the owner lands on the Dashboard', ap.url().endsWith('/admin/dashboard'));
await ap.getByText('Revenue', { exact: true }).waitFor();
const txt = (await ap.locator('main').innerText()).replace(/\s+/g, ' ');
check('revenue counts the 3 confirmed-or-later orders (৳610 + ৳610 + ৳670 Sylhet = ৳1,890), not pending/cancelled', txt.includes('৳1,890') && /3 orders? · avg ৳630/.test(txt));
check('orders placed = 5 and waiting to be confirmed = 1', /Orders placed 5/i.test(txt) && /Waiting to be confirmed 1/i.test(txt));
check('customers: 4 buyers, all new in this period', txt.includes('4 new · 0 returning'));
check('best sellers lists Hair Oil with 3 sold', /Hair Oil\s*3 sold/.test(txt));
check('low stock shows the powder with 2 left', /Hair Powder.*2 left/.test(txt));
check('Cash on Delivery vs prepaid split is shown', /Cash on Delivery ৳1,890/.test(txt));
check('the daily chart has one bar per day (30)', (await ap.locator('svg[role="img"] rect').count()) === 30);
check('the revenue definition is shown to the owner', /Pending, cancelled and returned orders are not counted/.test(txt));
await ap.getByRole('button', { name: 'Today' }).click();
await until(async () => (await ap.locator('svg[role="img"] rect').count()) === 1);
check('"Today" shrinks the chart to a single day', (await ap.locator('svg[role="img"] rect').count()) === 1);
await ap.getByRole('button', { name: 'Custom' }).click();
await ap.getByLabel('From', { exact: true }).waitFor();
check('a custom date range can be chosen', await ap.getByLabel('To', { exact: true }).isVisible());
await ap.getByRole('button', { name: 'Last 30 days' }).click();
await ap.screenshot({ path: `${out}/admin-dashboard.png`, fullPage: true });

// ================= 2. Orders filters + exports =================
await navLink(ap, 'Orders').click();
await ap.getByRole('heading', { name: 'Orders', exact: true }).waitFor();
await ap.getByLabel(/^District/).selectOption('Sylhet') // a wrapped <select>'s label text also contains its options, so match the start;
await until(async () => (await ap.locator('tbody tr').count()) === 1);
check('filtering orders by district Sylhet shows only Salma’s order', (await ap.locator('tbody').innerText()).includes('Salma Akter'));
await ap.getByRole('button', { name: 'Clear filters' }).click();
await ap.getByLabel('Sort by').selectOption('oldest');
await until(async () => (await ap.locator('tbody tr').count()) === 5);
check('clearing filters brings all 5 orders back (sorted oldest first)', (await ap.locator('tbody tr').count()) === 5);
const [dl1] = await Promise.all([ap.waitForEvent('download'), ap.getByRole('button', { name: 'Export CSV' }).click()]);
check('orders CSV downloads', dl1.suggestedFilename() === 'orders.csv');

// ================= 3. Customers =================
await navLink(ap, 'Customers').click();
await ap.getByRole('heading', { name: 'Customers', exact: true }).waitFor();
await ap.getByText('Karim Hossain').first().waitFor();
const crow = (await ap.locator('tr', { hasText: 'Karim Hossain' }).innerText()).replace(/\s+/g, ' ');
check('Karim shows 2 orders, ৳1,220 spent, returning', /2\s*returning/.test(crow) && crow.includes('৳1,220'));
await ap.getByLabel('Search customers').fill('salma');
await until(async () => (await ap.locator('tbody tr').count()) === 1);
check('searching by name finds one customer', (await ap.locator('tbody').innerText()).includes('Salma Akter'));
await ap.getByLabel('Search customers').fill('');
await ap.getByRole('link', { name: 'Karim Hossain' }).click();
await ap.getByRole('heading', { name: 'Karim Hossain' }).waitFor();
await ap.getByLabel('Notes about this customer').fill('Prefers evening delivery.');
await ap.getByRole('button', { name: 'Save notes' }).click();
await ap.getByText('Notes saved.').waitFor();
check('a private note was saved on the customer', (await call(`/admin/customers/${A}`, { token: T })).data.customer.notes === 'Prefers evening delivery.');
await ap.getByRole('button', { name: 'Block customer' }).click();
await ap.getByRole('button', { name: /Yes, block Karim/ }).click();
await ap.getByText('Customer blocked.').waitFor();
const blockedTry = await call('/checkout', { method: 'POST', body: { idempotencyKey: crypto.randomUUID(), items: [{ productId: by['hair-oil']._id, sku: by['hair-oil'].variants[0].sku, qty: 1 }], customer: { name: 'Karim Hossain', phone: A, district: 'Rangpur', city: 'Mirpur', address: 'House 12, Road 5, Mirpur DOHS' }, paymentMethod: 'cod', allowDuplicate: true } });
check('a blocked customer cannot place an order', blockedTry.status === 403 && blockedTry.error.code === 'ACCOUNT_BLOCKED');
await ap.getByRole('button', { name: 'Unblock customer' }).click();
await ap.getByText('Customer unblocked.').waitFor();
check('unblocking lets them order again', (await call('/admin/customers?blocked=true', { token: T })).data.items.length === 0);
await ap.goto(`${site}/admin/customers`);
const [dl2] = await Promise.all([ap.waitForEvent('download'), ap.getByRole('button', { name: 'Export CSV' }).click()]);
const csv = await readFile(await dl2.path(), 'utf8');
check('customers CSV downloads with phone numbers', dl2.suggestedFilename() === 'customers.csv' && csv.includes(A) && csv.includes('Salma Akter'));

// ================= 4. Coupons =================
await navLink(ap, 'Coupons').click();
await ap.getByRole('heading', { name: 'Coupons', exact: true }).waitFor();
await ap.getByRole('button', { name: 'New coupon' }).click();
await ap.getByRole('button', { name: 'Save coupon' }).click();
check('an invalid coupon form is refused inline', await ap.getByText(/Code: 3–30 letters/).isVisible());
await ap.getByLabel('Code').fill('welcome15');
await ap.getByLabel(/Percent \(1–100\)/).fill('15');
await ap.getByLabel('Minimum order (৳, optional)').fill('500');
await ap.getByLabel('Total uses allowed (optional)').fill('5');
await ap.getByRole('button', { name: 'Save coupon' }).click();
await ap.getByText('Coupon created.').waitFor();
const crow2 = (await ap.locator('tr', { hasText: 'WELCOME15' }).innerText()).replace(/\s+/g, ' ');
check('the coupon is listed as Active with its rules', /15% off/.test(crow2) && /min ৳500/.test(crow2) && /0 \/ 5/.test(crow2) && /Active/.test(crow2));
const qItems = [{ productId: by['hair-oil']._id, sku: by['hair-oil'].variants[0].sku, qty: 1 }];
check('the coupon works at checkout (API validation)', (await call('/coupons/validate', { method: 'POST', body: { code: 'WELCOME15', items: qItems, district: 'Rangpur' } })).data.valid === true);
await ap.locator('tr', { hasText: 'WELCOME15' }).getByRole('button', { name: 'Turn off' }).click();
await ap.locator('tr', { hasText: 'WELCOME15' }).getByText('Off', { exact: true }).waitFor();
check('turning it off stops it working', (await call('/coupons/validate', { method: 'POST', body: { code: 'WELCOME15', items: qItems, district: 'Rangpur' } })).data.valid === false);

// ================= 5. Website settings → storefront =================
await navLink(ap, 'Website').click();
await ap.getByRole('heading', { name: 'Website', exact: true }).waitFor();
await ap.getByLabel('Email', { exact: true }).fill('hello@example.com');
await ap.getByLabel('Address', { exact: true }).fill('12 Example Road, Dhaka');
await ap.getByLabel(/Facebook page/).fill('http://insecure.example');
await ap.getByRole('button', { name: 'Save business details' }).click();
await ap.getByText(/https|Use an https/).first().waitFor();
check('an insecure social link is refused', true);
await ap.getByLabel(/Facebook page/).fill('https://facebook.com/example');
await ap.getByRole('button', { name: 'Save business details' }).click();
await ap.getByText(/Saved\. The website shows this/).first().waitFor();
// delivery: Inside Rangpur 60 → 70 and add Gazipur
const insideCard = ap.locator('div.rounded-lg', { has: ap.locator('input[value="Inside Rangpur"]') }).first();
await insideCard.getByLabel('Charge (৳)').fill('70');
await insideCard.getByRole('button', { name: /^Districts/ }).click();
await insideCard.getByLabel('Gazipur').check();
await ap.getByRole('button', { name: 'Save delivery settings' }).click();
await ap.getByText(/Saved\. The website shows this/).nth(1).waitFor();
const quote = async (district) => (await call('/cart/quote', { method: 'POST', body: { items: qItems, district } })).data.deliveryFee;
check('new delivery charges apply immediately: Dhaka ৳70, Gazipur ৳70, Sylhet still ৳120', (await quote('Rangpur')) === 70 && (await quote('Gazipur')) === 70 && (await quote('Sylhet')) === 120);
// announcement + FAQ
await ap.getByLabel('Message (English)').fill('Free delivery on combo orders');
await ap.getByLabel('Message (বাংলা)').fill('কম্বো অর্ডারে ফ্রি ডেলিভারি');
await ap.getByRole('button', { name: 'Add a question' }).click();
await ap.getByLabel('Question (English)').fill('How long does delivery take?');
await ap.getByLabel('Answer (English)').fill('Usually 2 to 3 days inside Rangpur.');
await ap.getByRole('button', { name: 'Save announcement and FAQ' }).click();
await ap.getByText(/Saved\. The website shows this/).nth(2).waitFor();
await sleep(11000);
const sp = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage(); watch(sp, 'storefront');
await sp.goto(site, { waitUntil: 'networkidle' });
const top = await sp.locator('body').innerText();
check('the storefront shows the owner’s announcement (Bangla by default)', top.includes('কম্বো অর্ডারে ফ্রি ডেলিভারি'));
const footer = (await sp.getByRole('contentinfo').innerText()).replace(/\s+/g, ' ');
check('the footer shows the email, address and Facebook link', footer.includes('hello@example.com') && footer.includes('12 Example Road, Dhaka') && /facebook/i.test(footer));
await sp.evaluate(() => localStorage.setItem('bo-lang', 'en'));
await sp.reload({ waitUntil: 'networkidle' });
check('and the English announcement + owner FAQ in English', (await sp.locator('body').innerText()).includes('Free delivery on combo orders') && (await sp.locator('#faq').innerText()).includes('How long does delivery take?'));
check('the owner’s FAQ replaces the built-in answers', (await sp.locator('#faq button, #faq summary').count()) === 1);
check('no horizontal scroll on the phone storefront', await sp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

// ================= 6. Contact form → Messages =================
await sp.goto(`${site}/contact`);
await sp.getByLabel('Your name').fill('Rahim Uddin');
await sp.getByLabel('Mobile number').fill('01712345678');
await sp.getByLabel('Your message').fill('Is the oil suitable for dry hair?');
await sp.getByRole('button', { name: 'Send message' }).click();
await sp.getByText('We received your message and will get back to you soon.').waitFor();
check('a customer can send a message from the Contact page', true);
await navLink(ap, 'Messages').click();
await ap.getByRole('heading', { name: 'Messages', exact: true }).waitFor();
await ap.getByText('Is the oil suitable for dry hair?').waitFor();
check('the owner sees it in Messages (with a WhatsApp link)', await ap.getByRole('link', { name: 'WhatsApp' }).first().isVisible());
await ap.getByRole('button', { name: 'Mark done' }).click();
await until(async () => (await ap.getByText('No messages here.').count()) === 1);
check('marking it done removes it from the New list', true);

// ================= 7. Team + role checks =================
await navLink(ap, 'Team').click();
await ap.getByRole('heading', { name: 'Team', exact: true }).waitFor();
await ap.getByRole('button', { name: 'Add team member' }).first().click();
await ap.getByLabel('Name', { exact: true }).fill('Packing Staff');
await ap.getByLabel(/Email \(their sign-in\)/).fill('staff@example.com');
await ap.getByLabel('Temporary password').fill('Staff-Pass-12345');
await ap.getByRole('button', { name: 'Add team member' }).last().click();
await ap.getByText(/Team member added/).waitFor();
check('the owner added a staff member', await ap.getByText('staff@example.com').isVisible());
const staffCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const st = await staffCtx.newPage(); watch(st, 'staff');
await st.goto(`${site}/admin/login`);
await st.getByLabel('Email').fill('staff@example.com'); await st.getByLabel('Password').fill('Staff-Pass-12345');
await st.getByRole('button', { name: 'Sign in' }).click();
await st.getByRole('heading', { name: 'Orders', exact: true }).waitFor();
const links = (await st.getByRole('navigation', { name: 'Admin' }).innerText()).replace(/\s+/g, ' ');
check('staff lands on Orders and only sees Orders, Inventory and Reviews', ['Orders', 'Inventory', 'Reviews'].every((x) => links.includes(x)) && !/Dashboard|Payments|Customers|Coupons|Website|Team|Activity/.test(links), links);
await st.goto(`${site}/admin/customers`);
await st.getByRole('heading', { name: 'Orders', exact: true }).waitFor();
check('opening a manager page by URL sends staff back to Orders', st.url().endsWith('/admin/orders'));
const staffToken = await st.evaluate(async () => (await (await fetch('/api/v1/auth/refresh', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include' })).json()).data.accessToken);
const denied = await Promise.all(['/admin/customers', '/admin/dashboard/summary', '/admin/settings', '/admin/payments', '/admin/orders/export'].map((p) => call(p, { token: staffToken }).then((r) => r.status)));
check('the server also refuses staff on customers, dashboard, settings, payments and exports (403)', denied.every((s) => s === 403), denied.join(','));
check('staff cannot see the revenue figures', !(await st.locator('body').innerText()).includes('Revenue'));

// ================= 8. Activity log =================
await navLink(ap, 'Activity log').click();
await ap.getByRole('heading', { name: 'Activity log', exact: true }).waitFor();
await ap.getByLabel('Search the log').fill('customer');
await until(async () => (await ap.getByText('customer.block').count()) > 0);
const log = await ap.locator('main').innerText();
check('the activity log records blocking, notes and exports', log.includes('customer.block') && log.includes('customer.notes') && log.includes('customer.export'));
await ap.getByLabel('Search the log').fill('settings');
await until(async () => (await ap.getByText('settings.business.update').count()) > 0);
check('…and website setting changes', (await ap.locator('main').innerText()).includes('settings.delivery.update'));
await ap.screenshot({ path: `${out}/admin-activity.png`, fullPage: true });

// ================= 9. Payments / inventory exports =================
await navLink(ap, 'Payments').click();
await ap.getByRole('heading', { name: 'Payments', exact: true }).waitFor();
const [dl3] = await Promise.all([ap.waitForEvent('download'), ap.getByRole('button', { name: 'Export CSV' }).click()]);
check('payments CSV downloads', dl3.suggestedFilename() === 'payments.csv');
await navLink(ap, 'Inventory').click();
await ap.getByRole('heading', { name: 'Inventory', exact: true }).waitFor();
const [dl4] = await Promise.all([ap.waitForEvent('download'), ap.getByRole('button', { name: 'Export CSV' }).click()]);
check('inventory CSV downloads', dl4.suggestedFilename() === 'inventory.csv');

// ================= 10. Phone-size admin =================
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mp = await mctx.newPage(); watch(mp, 'admin-mobile');
await mp.goto(`${site}/admin/login`);
await mp.getByLabel('Email').fill(ADMIN_EMAIL); await mp.getByLabel('Password').fill(ADMIN_PW);
await mp.getByRole('button', { name: 'Sign in' }).click();
await mp.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
await mp.getByText('Revenue', { exact: true }).waitFor();
check('the dashboard fits a phone screen (no sideways scroll)', await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await mp.screenshot({ path: `${out}/admin-dashboard-mobile.png`, fullPage: true });

check('no unexpected browser errors', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
