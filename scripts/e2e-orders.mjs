// End-to-end Phase 7 check: the order lifecycle from both sides (customer on a phone, owner in the admin).
// Needs a FRESH throwaway database, the API on :5001 and the built site on :4173 (see README). Usage:
//   ADMIN_EMAIL=... ADMIN_PW=... node scripts/e2e-orders.mjs [siteUrl] [outDir]
import { chromium } from 'playwright-core';

const site = process.argv[2] ?? 'http://localhost:4173';
const out = process.argv[3] ?? '.';
const { ADMIN_EMAIL, ADMIN_PW } = process.env;
let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const call = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(`${site}/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return { status: res.status, ...json };
};
const T = (await call('/auth/admin/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PW } })).data.accessToken;
const adminList = (await call('/admin/products?limit=50', { token: T })).data.items;
const bySlug = Object.fromEntries(adminList.map((p) => [p.slug, p]));
for (const p of adminList) await call(`/admin/products/${p._id}`, { method: 'PATCH', token: T, body: { visibility: 'published' } });
const stockOf = async (slug) => (await call('/admin/inventory', { token: T })).data.items.find((i) => i.productId === bySlug[slug]._id).stock;
for (const s of ['hair-oil', 'hair-powder', 'wooden-comb']) await call(`/admin/inventory/${bySlug[s]._id}/${bySlug[s].variants[0].sku}`, { method: 'PATCH', token: T, body: { set: 10, note: 'e2e setup' } });
await call('/admin/settings/orders', { method: 'PATCH', token: T, body: { returnWindowDays: 7 } });
await sleep(11000); // public responses are cached for 10 s

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const errors = [];
const watch = (page, tag) => { page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e}`)); page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`${tag} console: ${m.text()}`)); };
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await phone.addInitScript(() => { try { if (!localStorage.getItem('bo-lang')) localStorage.setItem('bo-lang', 'en'); } catch { /* */ } });
const page = await phone.newPage(); watch(page, 'customer');
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

let n = 20;
const phones = [];
async function orderCod() {
  await page.goto(site, { waitUntil: 'networkidle' });
  await page.locator('#products').getByRole('button', { name: 'Add to cart' }).nth(1).click(); // cards: combo first, then oil
  const drawer = page.getByRole('dialog', { name: 'Your cart' });
  await drawer.waitFor();
  await drawer.getByRole('button', { name: 'Checkout' }).click();
  await page.waitForURL('**/checkout');
  const ph = `0171234${String(6000 + n++)}`; phones.push(ph);
  await page.getByLabel('Full name').fill('Karim Hossain');
  await page.getByLabel('Mobile number').fill(ph);
  await page.getByLabel('District').selectOption('Rangpur');
  await page.getByLabel('City / Thana / Area').fill('Mirpur');
  await page.getByLabel('Full address').fill('House 12, Road 5, Block C, Mirpur DOHS');
  await page.getByRole('button', { name: /^Place order/ }).last().click();
  await page.waitForURL(/\/order\/HO-/);
  const no = (await page.getByTestId('order-no').innerText()).trim();
  return { no, ph };
}
/** Clicks the track button and waits for `okLocator`. Lookups are limited to 5 a minute per IP, so if the page says
 *  "too many attempts" we wait out the window and retry (this also proves the limit shows a friendly message). */
let rateLimitSeen = false;
const submitTrack = async (p, buttonName, okLocator, limitedRe = /Too many attempts/) => {
  for (let i = 0; i < 4; i++) {
    await p.getByRole('button', { name: buttonName }).click();
    const r = await Promise.race([okLocator.waitFor({ timeout: 20000 }).then(() => 'ok'), p.getByText(limitedRe).waitFor({ timeout: 20000 }).then(() => 'limited')]);
    if (r === 'ok') return;
    rateLimitSeen = true;
    await sleep(62000);
  }
  throw new Error('track lookup kept being rate limited');
};
const track = async (no, ph) => {
  await page.goto(`${site}/track?order=${no}`);
  await page.getByLabel(/Mobile number/).fill(ph);
  await submitTrack(page, 'Track order', page.getByTestId('track-status'));
};

// admin browser
const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const ap = await adminCtx.newPage(); watch(ap, 'admin');
await ap.goto(`${site}/admin/login`);
await ap.getByLabel('Email').fill(ADMIN_EMAIL); await ap.getByLabel('Password').fill(ADMIN_PW);
await ap.getByRole('button', { name: 'Sign in' }).click();
await ap.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor(); // owners now land on the Dashboard
await ap.goto(`${site}/admin/orders`);
await ap.getByRole('heading', { name: 'Orders', exact: true }).waitFor();

// ================= 1. Customer orders; order page links to tracking =================
const A = await orderCod();
check('order page offers "Track this order" and an invoice link', await page.getByRole('link', { name: 'Track this order' }).isVisible() && await page.getByRole('link', { name: 'View invoice' }).isVisible());
await page.getByRole('link', { name: 'Track this order' }).click();
await page.waitForURL(/\/track\?order=HO-/);
check('track page is prefilled with the order number', (await page.getByLabel(/Order number/).inputValue()) === A.no);
await page.getByLabel(/Mobile number/).fill('01799999999');
await submitTrack(page, 'Track order', page.getByText(/could not find an order/i));
check('a wrong phone number gets the generic "not found" message', true);
await page.getByLabel(/Mobile number/).fill(A.ph);
await submitTrack(page, 'Track order', page.getByTestId('track-status'));
const t1 = await page.locator('main').innerText();
check('tracking shows "Order received" and no address / full phone', (await page.getByTestId('track-status').innerText()) === 'Order received' && !/House 12|Mirpur DOHS/.test(t1) && !t1.includes(A.ph));
check('no horizontal scroll on the phone track page', await noOverflow(page));
await page.screenshot({ path: `${out}/track-mobile.png`, fullPage: true });
const inv = await fetch(`${site}/api/v1/orders/${A.no}/invoice`);
check('customer invoice needs the signed token', inv.status === 400 || inv.status === 401);

// ================= 2. Owner: attention strip, WhatsApp confirm, confirm, courier, ship =================
await ap.getByRole('link', { name: 'Orders' }).click();
await ap.reload();
await ap.getByText('Needs your attention').waitFor();
check('admin Orders shows "1 new order to confirm"', await ap.getByText(/new order to confirm/).isVisible());
await ap.getByLabel('1 waiting').first().waitFor({ timeout: 15000 }).catch(() => undefined); // the menu counts load a moment after the page
check('menu shows a badge for waiting items', await ap.getByLabel('1 waiting').first().isVisible());
await ap.getByRole('link', { name: A.no }).click();
await ap.getByRole('heading', { name: A.no }).waitFor();
const bn = await ap.getByRole('link', { name: 'বাংলা message' }).getAttribute('href');
check('WhatsApp confirm link is prefilled for the customer’s number', bn.startsWith(`https://wa.me/88${A.ph}?text=`) && decodeURIComponent(bn).includes(A.no));
await ap.screenshot({ path: `${out}/admin-order-actions.png`, fullPage: true });
await ap.getByRole('button', { name: 'Mark confirmed' }).click();
await ap.getByText('Order marked confirmed.').waitFor();
check('owner confirmed the order', (await call(`/admin/orders?q=${A.no}`, { token: T })).data.items[0].status === 'confirmed');
check('only the next valid steps are offered (processing / shipped)', await ap.getByRole('button', { name: 'Mark processing' }).isVisible() && await ap.getByRole('button', { name: 'Mark shipped' }).isVisible() && !(await ap.getByRole('button', { name: 'Mark delivered' }).count()));
await ap.getByLabel('Courier', { exact: true }).fill('Steadfast');
await ap.getByLabel('Tracking number').fill('TRK-777');
await ap.getByLabel(/Internal notes/).fill('Call before delivery — internal');
await ap.getByRole('button', { name: 'Save courier & notes' }).click();
await ap.getByText('Saved.').waitFor();
await ap.getByRole('button', { name: 'Mark shipped' }).click();
await ap.getByText('Order marked shipped.').waitFor();
await ap.getByText('Correct delivery address').waitFor({ state: 'detached' });
check('shipped; address can no longer be edited', true);

// ================= 3. Customer sees shipped + courier, but cannot cancel =================
await track(A.no, A.ph);
const t3 = await page.locator('main').innerText();
check('customer sees Shipped, courier and tracking number', (await page.getByTestId('track-status').innerText()) === 'Shipped' && t3.includes('Steadfast') && t3.includes('TRK-777'));
check('internal notes are not visible to the customer', !t3.includes('internal'));
check('a shipped order has no cancel button', (await page.getByRole('button', { name: 'Cancel this order' }).count()) === 0);

// ================= 4. A second order: customer asks to cancel, owner approves =================
const stockBefore = await stockOf('hair-oil');
const B = await orderCod();
check('second order took one unit of stock', (await stockOf('hair-oil')) === stockBefore - 1);
await track(B.no, B.ph);
await page.getByRole('button', { name: 'Cancel this order' }).click();
await page.getByRole('button', { name: 'Send cancellation request' }).click(); // empty reason
check('an empty reason is not sent', (await page.getByText(/request was sent/).count()) === 0);
await page.getByLabel('Reason').fill('Ordered by mistake');
await page.getByRole('button', { name: 'Send cancellation request' }).click();
await page.getByText(/cancellation request was sent/i).waitFor();
check('customer is told the request was sent; order still pending', (await call(`/admin/orders?q=${B.no}`, { token: T })).data.items[0].status === 'pending');
await ap.goto(`${site}/admin/orders`);
await ap.getByText(/cancellation request/).first().waitFor();
await ap.getByRole('link', { name: B.no }).click();
await ap.getByText('cancellation requested', { exact: true }).waitFor();
await ap.getByRole('button', { name: 'Approve & cancel order' }).click();
await ap.getByText('Order cancelled and stock restored.').waitFor();
check('approving cancelled the order and restored the stock', (await stockOf('hair-oil')) === stockBefore && (await call(`/admin/orders?q=${B.no}`, { token: T })).data.items[0].status === 'cancelled');
await track(B.no, B.ph);
check('customer sees "Cancelled"', (await page.getByTestId('track-status').innerText()) === 'Cancelled');

// ================= 5. Deliver order A → review → moderation → shown on the site =================
await ap.goto(`${site}/admin/orders`);
await ap.getByRole('link', { name: A.no }).click();
await ap.getByRole('button', { name: 'Mark delivered' }).click();
await ap.getByText('Order marked delivered.').waitFor();
const done = (await call(`/admin/orders?q=${A.no}`, { token: T })).data.items[0];
check('delivered: cash-on-delivery payment is marked collected', done.status === 'delivered' && done.paymentStatus === 'cod_collected');
await track(A.no, A.ph);
await page.getByText('Review your purchase').waitFor();
await page.getByRole('button', { name: 'Submit review' }).click();
check('review form asks for a rating first', await page.getByText('Please choose a rating.').isVisible());
await page.getByRole('radio', { name: '5 out of 5' }).click();
await page.getByLabel(/Your review/).fill('Lovely smell and my hair feels soft. <b>Will buy again</b>');
await page.getByRole('button', { name: 'Submit review' }).click();
await page.getByText(/review was received/).waitFor();
check('customer is told the review awaits approval', await page.getByRole('status').filter({ hasText: /after our team approves/ }).isVisible());
await page.screenshot({ path: `${out}/track-delivered-review.png`, fullPage: true });
await page.goto(site, { waitUntil: 'networkidle' });
check('the pending review is NOT on the landing page', (await page.locator('#reviews').innerText()).includes('Lovely smell') === false);
await ap.goto(`${site}/admin/reviews`);
await ap.getByText('Lovely smell').waitFor();
check('review is in the moderation queue, markup stripped', !(await ap.locator('main').innerText()).includes('<b>'));
await ap.screenshot({ path: `${out}/admin-reviews.png`, fullPage: true });
await ap.getByRole('button', { name: 'Approve', exact: true }).click();
await ap.getByText(/now on the site/).waitFor();
await sleep(11000);
await page.goto(site, { waitUntil: 'networkidle' });
await page.locator('#reviews').scrollIntoViewIfNeeded();
const rv = await page.locator('#reviews').innerText();
check('after approval the landing page shows it with "Verified purchase" and a short name', rv.includes('Lovely smell') && rv.includes('Verified purchase') && rv.includes('Karim H.') && !rv.includes(A.ph));
await page.locator('#reviews').screenshot({ path: `${out}/reviews-section.png` });

// ================= 6. Return: request → approve → record return with restock =================
await track(A.no, A.ph);
await page.getByRole('button', { name: 'Request a return' }).click();
await page.getByLabel('Reason').fill('Bottle leaked in the parcel');
await page.getByRole('button', { name: 'Send return request' }).click();
await page.getByText(/return request was sent/i).waitFor();
await ap.goto(`${site}/admin/orders`);
await ap.getByRole('link', { name: A.no }).click();
await ap.getByText('return requested', { exact: true }).waitFor();
await ap.getByRole('button', { name: 'Approve return' }).click();
await ap.getByText(/Return approved/).waitFor();
const before = await stockOf('hair-oil');
await ap.getByRole('button', { name: 'Process return' }).click();
await ap.getByRole('button', { name: 'Record return' }).click();
await ap.getByText('Return recorded.').waitFor();
const ret = (await call(`/admin/orders?q=${A.no}`, { token: T })).data.items[0];
check('return recorded: order returned, stock +1, refund flagged', ret.status === 'returned' && (await stockOf('hair-oil')) === before + 1 && ret.paymentStatus === 'refund_pending');

// ================= 7. Invoice + CSV =================
const [popup] = await Promise.all([adminCtx.waitForEvent('page'), ap.getByRole('button', { name: 'Invoice (print / PDF)' }).click()]);
await popup.waitForLoadState();
const invText = await popup.locator('body').innerText();
check('admin invoice opens with the order number, items and totals', invText.includes(A.no) && invText.includes('Hair Oil') && invText.includes('৳610') && invText.includes('House 12'));
await popup.close();
await ap.goto(`${site}/admin/orders`);
const [dl] = await Promise.all([ap.waitForEvent('download'), ap.getByRole('button', { name: 'Export CSV' }).click()]);
const csv = (await (await import('node:fs/promises')).readFile(await dl.path(), 'utf8'));
check('CSV export downloads with both orders', dl.suggestedFilename() === 'orders.csv' && csv.includes(A.no) && csv.includes(B.no));

// ================= 8. Bangla track page + footer link =================
const bnCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
await bnCtx.addInitScript(() => { try { localStorage.setItem('bo-lang', 'bn'); } catch { /* */ } });
const bp = await bnCtx.newPage(); watch(bp, 'bangla');
await bp.goto(site, { waitUntil: 'networkidle' });
await bp.getByRole('contentinfo').getByRole('link', { name: 'অর্ডার ট্র্যাক করুন' }).click();
await bp.waitForURL('**/track');
await bp.getByLabel(/অর্ডার নম্বর/).fill(A.no); await bp.getByLabel(/মোবাইল নম্বর/).fill(A.ph);
await submitTrack(bp, 'ট্র্যাক করুন', bp.getByTestId('track-status'), /অনেকবার চেষ্টা/);
check('Bangla tracking works from the footer link', (await bp.getByTestId('track-status').innerText()) === 'ফেরত');

check('the 5-per-minute lookup limit showed a friendly message (and was waited out)', rateLimitSeen);
check('no unexpected browser errors', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
