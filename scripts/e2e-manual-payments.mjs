// End-to-end check of the manual payment system: Cash on Delivery, manual bKash and bank transfer — no payment
// gateway involved. Customer on a phone + owner in the admin. Needs a FRESH throwaway database, API on :5001 and the
// built site on :4173 (see README). Usage:
//   ADMIN_EMAIL=... ADMIN_PW=... node scripts/e2e-manual-payments.mjs [siteUrl] [outDir]
import { chromium } from 'playwright-core';

const site = process.argv[2] ?? 'http://localhost:4173';
const out = process.argv[3] ?? '.';
const { ADMIN_EMAIL, ADMIN_PW } = process.env;
let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Polls until `fn` is truthy (for UI that updates after a server round trip). */
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(150); } return false; };

const call = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(`${site}/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return { status: res.status, ...json };
};
const T = (await call('/auth/admin/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PW } })).data.accessToken;
const adminList = (await call('/admin/products?limit=50', { token: T })).data.items;
const bySlug = Object.fromEntries(adminList.map((p) => [p.slug, p]));
for (const p of adminList) await call(`/admin/products/${p._id}`, { method: 'PATCH', token: T, body: { visibility: 'published' } });
for (const s of ['hair-oil', 'hair-powder', 'wooden-comb']) await call(`/admin/inventory/${bySlug[s]._id}/${bySlug[s].variants[0].sku}`, { method: 'PATCH', token: T, body: { set: 10, note: 'e2e setup' } });
// Test values only, in a throwaway database.
const cfg = await call('/admin/settings/payments', { method: 'PATCH', token: T, body: {
  manual: { enabled: true, bkash: '01700000099', instructions: { bkash: 'Use "Send Money", not "Cash Out".' } },
  bank: { enabled: true, bankName: 'Example Bank', accountName: 'Test Business', accountNumber: '1234-567-890', branch: 'Dhanmondi', instructions: 'Write your order number as the transfer reference.' },
} });
check('admin API saved bKash + bank details', cfg.status === 200 && cfg.data.bank.enabled && cfg.data.manual.enabled);
await sleep(11000); // public responses are cached for 10 s

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const errors = [];
const watch = (page, tag) => { page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e}`)); page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`${tag} console: ${m.text()}`)); };
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await phone.addInitScript(() => { try { if (!localStorage.getItem('bo-lang')) localStorage.setItem('bo-lang', 'en'); } catch { /* */ } });
const page = await phone.newPage(); watch(page, 'customer');
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

let n = 40;
const toCheckout = async () => {
  await page.goto(site, { waitUntil: 'networkidle' });
  await page.locator('#products').getByRole('button', { name: 'Add to cart' }).nth(1).click(); // oil (combo is first)
  const drawer = page.getByRole('dialog', { name: 'Your cart' });
  await drawer.waitFor();
  await drawer.getByRole('button', { name: 'Checkout' }).click();
  await page.waitForURL('**/checkout');
  await page.getByRole('heading', { name: 'Order summary' }).waitFor();
  await page.getByRole('radiogroup').getByRole('radio').first().waitFor(); // payment methods load a moment after the page
  await sleep(400);
};
const fillCheckout = async () => {
  await page.getByLabel('Full name').fill('Karim Hossain');
  await page.getByLabel('Mobile number').fill(`0171234${String(7000 + n++)}`);
  await page.getByLabel('District').selectOption('Rangpur');
  await page.getByLabel('City / Thana / Area').fill('Mirpur');
  await page.getByLabel('Full address').fill('House 12, Road 5, Block C, Mirpur DOHS');
};
const place = async (radio, button = /^Place order/) => {
  await page.getByRole('radio', { name: radio }).check();
  await sleep(1200); // let the server re-price after the district was chosen (a click on a stale total is correctly refused)
  await page.getByRole('button', { name: button }).last().click();
  await page.waitForURL(/\/order\/HO-/, { timeout: 12000 }).catch(async (e) => { console.log('DEBUG place failed:', (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 900)); throw e; });
  return (await page.getByTestId('order-no').innerText()).trim();
};
const orderApi = async (no) => (await call(`/admin/orders?q=${no}`, { token: T })).data.items[0];

// admin browser
const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const ap = await adminCtx.newPage(); watch(ap, 'admin');
await ap.goto(`${site}/admin/login`);
await ap.getByLabel('Email').fill(ADMIN_EMAIL); await ap.getByLabel('Password').fill(ADMIN_PW);
await ap.getByRole('button', { name: 'Sign in' }).click();
await ap.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor(); // owners now land on the Dashboard
await ap.goto(`${site}/admin/orders`);
await ap.getByRole('heading', { name: 'Orders', exact: true }).waitFor();

// ================= 1. Checkout offers COD, bKash and bank — and no online gateway =================
await toCheckout();
const labels = (await page.locator('label:has(input[type=radio])').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
check('checkout offers Cash on Delivery, bKash and Bank transfer (no online gateway)', labels.length === 3 && /Cash on Delivery/.test(labels[0]) && /bKash/.test(labels[1]) && /Bank transfer/.test(labels[2]) && !labels.some((l) => /Pay online/.test(l)), labels.map((l) => l.slice(0, 20)).join(' | '));
check('COD is the default and shows no account details', await page.getByRole('radio').first().isChecked() && (await page.getByTestId('payment-details').count()) === 0);
await page.getByRole('radio', { name: /bKash/ }).check();
const bk = await page.getByTestId('payment-details').innerText();
check('choosing bKash shows the owner’s number and instructions at checkout', bk.includes('01700000099') && bk.includes('Send Money'));
await page.getByRole('radio', { name: /Bank transfer/ }).check();
const bd = await page.getByTestId('payment-details').innerText();
check('choosing Bank transfer shows bank, account name, number, branch and instructions', ['Example Bank', 'Test Business', '1234-567-890', 'Dhanmondi', 'transfer reference'].every((t) => bd.includes(t)));
check('the page says an order is confirmed only after the payment is verified', /only after we verify|confirmed only after/i.test(bd));
await fillCheckout();
check('no horizontal scroll on the phone checkout', await noOverflow(page));
await page.screenshot({ path: `${out}/checkout-bank-mobile.png`, fullPage: true });

// ================= 2. Bank order: a submitted reference never marks it paid =================
const bankNo = await place(/Bank transfer/);
check('order page shows the bank account to pay into', (await page.getByTestId('merchant-bank').innerText()).includes('1234-567-890'));
await page.getByRole('button', { name: 'Submit payment details' }).click();
check('an empty transaction ID is rejected inline', await page.getByText(/Enter the transaction ID exactly/).isVisible());
await page.getByLabel(/Transaction ID/).fill('trf-2026-0042');
await page.getByLabel(/Name on the sending account/).fill('Karim Hossain');
await page.getByLabel(/Payment reference/).fill('City Bank, 12 Nov');
await page.getByRole('button', { name: 'Submit payment details' }).click();
await page.getByText(/We received your payment details/).waitFor();
let o = await orderApi(bankNo);
check('after submitting, the order is still Pending — not paid, not confirmed', o.paymentStatus === 'pending' && o.status === 'pending' && o.paymentMethod === 'manual_bank');
const early = await call(`/admin/orders/${o._id}/status`, { method: 'PATCH', token: T, body: { status: 'confirmed' } });
check('the owner cannot process an unverified order', early.status === 422 && early.error.code === 'PAYMENT_REQUIRED');
await page.screenshot({ path: `${out}/order-bank-pending-mobile.png`, fullPage: true });

// ================= 3. Owner verifies against the real statement =================
await ap.getByRole('link', { name: 'Payments' }).click();
await ap.getByRole('heading', { name: 'Payments', exact: true }).waitFor();
await ap.getByLabel('Account number', { exact: true }).waitFor(); // the settings card loads a moment after the page
check('Payments page shows the settings (bKash number, bank form)', await ap.getByText('Bank transfer', { exact: true }).first().isVisible() && (await ap.getByLabel('Account number', { exact: true }).inputValue()) === '1234-567-890');
await ap.getByLabel('Filter by status').selectOption('pending');
await ap.getByText('TRF-2026-0042').waitFor();
const row = (await ap.locator('tr', { hasText: bankNo }).innerText()).replace(/\s+/g, ' ');
check('the pending row shows the customer’s transaction ID, reference and sender name', row.includes('TRF-2026-0042') && row.includes('City Bank, 12 Nov') && row.includes('Karim Hossain') && /Pending/.test(row));
await ap.screenshot({ path: `${out}/admin-payments-pending.png`, fullPage: true });
await ap.getByRole('button', { name: 'Verify', exact: true }).click();
check('the verify box tells the owner to check the bank statement and the transaction ID', (await ap.getByText(/bank statement/).first().isVisible()) && (await ap.locator('main').innerText()).includes('TRF-2026-0042'));
await ap.getByLabel('Note (optional)').fill('Seen in statement');
await ap.getByRole('button', { name: 'Yes, verify' }).click();
await ap.getByText(/now marked paid/).waitFor();
o = await orderApi(bankNo);
check('after the owner verifies, the order is paid', o.paymentStatus === 'paid');
check('and can now be processed', (await call(`/admin/orders/${o._id}/status`, { method: 'PATCH', token: T, body: { status: 'confirmed' } })).status === 200);
await ap.getByLabel('Filter by status').selectOption('paid');
await ap.locator('tr', { hasText: bankNo }).getByRole('button', { name: 'History' }).click();
const hist = await ap.locator('main').innerText();
check('payment history shows who verified it, when, and the note', / — verified/.test(hist) && /by Owner/.test(hist) && hist.includes('Seen in statement') && /manual submitted/.test(hist));
await ap.screenshot({ path: `${out}/admin-payments-history.png`, fullPage: true });
await page.reload();
await page.getByText('Payment received').first().waitFor();
check('the customer’s order page now says "Payment received"', true);

// ================= 4. Refund (recorded, partial then full) =================
await ap.locator('tr', { hasText: bankNo }).getByRole('button', { name: 'Record refund' }).click();
check('refund box explains that no money is sent by the system', await ap.getByText(/does not send any money/).isVisible());
await ap.getByLabel(/Amount refunded/).fill('100');
await ap.getByLabel('Reason (required)').fill('One item damaged');
await ap.getByRole('button', { name: 'Record refund' }).first().click(); // the panel's confirm button sits above the table rows
await ap.getByText('Refund recorded.').waitFor();
await ap.getByLabel('Filter by status').selectOption(''); // the row leaves the "Verified" filter once refunded
await ap.locator('tr', { hasText: bankNo }).getByText('Partly refunded').waitFor();
check('partial refund shows "Partly refunded"', true);
await ap.locator('tr', { hasText: bankNo }).getByRole('button', { name: 'Record refund' }).click();
await ap.getByLabel('Reason (required)').fill('Rest refunded, order cancelled');
await ap.getByRole('button', { name: 'Record refund' }).first().click(); // the panel's confirm button sits above the table rows
await ap.getByText('Refund recorded.').waitFor();
await ap.getByLabel('Filter by status').selectOption(''); // the row leaves the "Verified" filter once refunded
await ap.locator('tr', { hasText: bankNo }).getByText('Refunded', { exact: true }).waitFor();
check('full refund shows "Refunded"', true);
check('order payment status is Refunded in the API', (await orderApi(bankNo)).paymentStatus === 'refunded');
await page.reload();
await page.getByText(/refunded this payment/).waitFor();
check('the customer sees the refund', true);

// ================= 5. COD stays separate from prepaid =================
await toCheckout(); await fillCheckout();
const codNo = await place(/Cash on Delivery/);
check('COD order shows no payment form and no account details', (await page.getByTestId('merchant-bank').count()) === 0 && (await page.getByRole('button', { name: 'Submit payment details' }).count()) === 0);
await ap.goto(`${site}/admin/orders`);
await ap.getByLabel('Filter by payment type').selectOption('cod');
await ap.getByRole('link', { name: codNo }).waitFor();
await ap.getByRole('link', { name: bankNo }).waitFor({ state: 'detached' });
check('"Cash on Delivery only" lists the COD order and not the bank order', (await ap.getByRole('link', { name: bankNo }).count()) === 0);
await ap.getByLabel('Filter by payment type').selectOption('prepaid');
await ap.getByRole('link', { name: bankNo }).waitFor();
await ap.getByRole('link', { name: codNo }).waitFor({ state: 'detached' });
check('"Prepaid only" lists the bank order and not the COD order', (await ap.getByRole('link', { name: codNo }).count()) === 0);
const codPay = (await call('/admin/payments?provider=cod', { token: T })).data.items;
check('COD payments are a separate type in Payments', codPay.length === 1 && codPay[0].status === 'cod_pending');

// ================= 6. bKash: reject → customer resubmits → verify =================
await toCheckout(); await fillCheckout();
const bkNo = await place(/bKash/);
check('bKash order page shows the owner’s number', (await page.getByTestId('merchant-number').innerText()) === '01700000099');
await page.getByLabel(/Transaction ID/).fill('wrong12345');
await page.getByLabel(/Number you sent from/).fill('01712345678');
await page.getByRole('button', { name: 'Submit payment details' }).click();
await page.getByText(/We received your payment details/).waitFor();
await ap.goto(`${site}/admin/payments`);
await ap.getByLabel('Filter by status').selectOption('pending');
await ap.locator('tr', { hasText: bkNo }).getByRole('button', { name: 'Reject' }).click();
await ap.getByLabel('Note (optional)').fill('No such transaction');
await ap.getByRole('button', { name: 'Yes, reject' }).click();
await ap.getByText('Payment rejected.').waitFor();
await page.reload();
await page.getByText(/could not verify that payment/).waitFor();
check('a rejected payment tells the customer to check and resubmit', true);
await page.getByLabel(/Transaction ID/).fill('right67890A');
await page.getByLabel(/Number you sent from/).fill('01712345678');
await page.getByRole('button', { name: 'Submit payment details' }).click();
await page.getByText(/We received your payment details/).waitFor();
await ap.reload();
await ap.getByLabel('Filter by status').selectOption('pending');
await ap.locator('tr', { hasText: bkNo }).getByRole('button', { name: 'Verify', exact: true }).click();
await ap.getByRole('button', { name: 'Yes, verify' }).click();
await ap.getByText(/now marked paid/).waitFor();
check('after resubmitting and verifying, the bKash order is paid', (await orderApi(bkNo)).paymentStatus === 'paid');

// ================= 7. Everything is configurable from the admin =================
await ap.goto(`${site}/admin/payments`);
await ap.getByLabel('Account number', { exact: true }).waitFor(); // wait for the settings card to load before typing
await ap.getByLabel('Instructions (optional)').last().fill('NEW: transfer within 24 hours.');
await ap.getByRole('button', { name: 'Save bank details' }).click();
await ap.getByText('Saved', { exact: true }).waitFor();
const zones = async () => (await call('/delivery/zones')).data.methods;
check('the new instruction is served by the API right after saving', await until(async () => (await zones()).bank?.instructions === 'NEW: transfer within 24 hours.'));
await toCheckout();
await page.getByRole('radio', { name: /Bank transfer/ }).check();
const shownInstr = (await page.getByTestId('payment-details').innerText()).replace(/\s+/g, ' ');
check('instruction text edited in the admin appears at checkout', shownInstr.includes('NEW: transfer within 24 hours.'), shownInstr.slice(0, 160));
const bankBox = ap.getByRole('checkbox', { name: /^Bank transfer/ });
await bankBox.click(); // controlled checkbox: it flips only after the save round trip
await until(async () => !(await bankBox.isChecked()));
check('bank transfer is no longer offered by the API once switched off', await until(async () => (await zones()).bank === null));
await toCheckout();
const radiosNow = (await page.locator('label:has(input[type=radio])').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').slice(0, 30));
check('switching bank transfer off removes it from checkout', radiosNow.length === 2 && (await page.getByText('Bank transfer').count()) === 0, radiosNow.join(' | '));
const codBox = ap.getByRole('checkbox', { name: /Cash on Delivery/ });
await codBox.click();
const off = await until(async () => !(await codBox.isChecked()));
await codBox.click();
const on = await until(async () => codBox.isChecked());
check('COD can be switched off and on from the admin', off && on);

// ================= 8. Bangla =================
const bnCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await bnCtx.addInitScript(() => { try { localStorage.setItem('bo-lang', 'bn'); } catch { /* */ } });
const bp = await bnCtx.newPage(); watch(bp, 'bangla');
await bp.goto(site, { waitUntil: 'networkidle' });
await bp.locator('#products').getByRole('button').filter({ hasText: /কার্টে/ }).nth(1).click();
await bp.getByRole('dialog').getByRole('button', { name: /চেকআউট/ }).click();
await bp.waitForURL('**/checkout');
await bp.getByRole('radio', { name: /বিকাশ/ }).check();
check('Bangla checkout shows the bKash details in Bangla', (await bp.getByTestId('payment-details').innerText()).includes('কীভাবে পেমেন্ট করবেন'));

check('no unexpected browser errors', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
