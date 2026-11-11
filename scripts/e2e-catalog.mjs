// End-to-end check of Phase 4 against a RUNNING stack (API on :5001, site on :4173) using a THROWAWAY database.
// Usage: ADMIN_EMAIL=... ADMIN_PW=... node scripts/e2e-catalog.mjs [siteUrl] [outDir]
import { chromium } from 'playwright-core';

const site = process.argv[2] ?? 'http://localhost:4173';
const out = process.argv[3] ?? '.';
const { ADMIN_EMAIL, ADMIN_PW } = process.env;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource.*(401|403|409|422)/.test(m.text()) && errors.push('console: ' + m.text()));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) failed++; };
const text = async (sel) => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ');
const api = (path) => page.evaluate(async (p) => (await fetch('/api/v1' + p)).json(), path);

// 1. Storefront before anything is published: must degrade gracefully, never show fake products.
await page.goto(site, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
check('empty shop shows an honest empty state', (await text('#products')).includes('পণ্য হালনাগাদ'));
check('no offer section without a published featured product', (await page.locator('#offer').count()) === 0);

// 2. Admin login: wrong then right password; route guard.
await page.goto(site + '/admin/products', { waitUntil: 'networkidle' });
check('admin route redirects anonymous users to login', page.url().endsWith('/admin/login'));
await page.getByLabel('Email').fill(ADMIN_EMAIL);
await page.getByLabel('Password').fill('definitely-wrong');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByText('Incorrect email or password.').waitFor();
check('wrong password shows a clear error', true);
await page.getByLabel('Password').fill(ADMIN_PW);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL('**/admin/dashboard');
check('the owner signs in and lands on the Dashboard', (await text('h1')) === 'Dashboard');
await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Products', exact: true }).click();
await page.getByRole('heading', { name: 'Products', exact: true }).waitFor();
await page.locator('tbody tr').first().waitFor();
check('list shows the 4 seeded draft products', (await page.locator('tbody tr').count()) === 4);

// 3. Inventory: set stock with a reason (logged).
await page.getByRole('link', { name: 'Inventory' }).click();
await page.getByRole('heading', { name: 'Stock levels' }).waitFor();
for (const sku of ['HO-OIL-200', 'HO-PWD-225', 'HO-COMB']) {
  await page.locator('tr', { hasText: sku }).getByRole('button', { name: 'Adjust' }).click();
  await page.getByLabel('Action').selectOption('set');
  await page.getByLabel('New stock count').fill('20');
  await page.getByLabel('Reason').fill('opening count');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText(`${sku}): 0 → 20`).waitFor();
}
check('stock set for oil, powder and comb', true);
await page.locator('tr', { hasText: 'HO-OIL-200' }).getByRole('button', { name: 'Adjust' }).click();
await page.getByLabel('Action').selectOption('remove');
await page.getByLabel('Quantity').fill('999');
await page.getByLabel('Reason').fill('too many');
await page.getByRole('button', { name: 'Save' }).click();
await page.getByText('Not enough stock for this adjustment').waitFor();
check('removing more than available is refused with a clear message', true);
await page.getByRole('button', { name: 'Cancel' }).click();
check('history lists the 3 stock changes', (await page.locator('section:has(h2:text-is("History")) tbody tr').count()) === 3);

// 4. Publish all four products; change the oil price through the form.
const publish = async (name, edit) => {
  await page.getByRole('link', { name: 'Products', exact: true }).click();
  await page.getByRole('link', { name: new RegExp('^' + name) }).first().click();
  await page.getByRole('heading', { name: 'Edit product' }).waitFor();
  await page.getByLabel('Visibility').selectOption('published');
  if (edit) await edit();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByText(/^Saved\./).waitFor();
};
await publish('Hair Oil', async () => { await page.locator('input[name="variants.0.regularPrice"]').fill('600'); await page.locator('input[name="variants.0.discountPrice"]').fill('550'); });
await publish('Hair Powder');
await publish('Wooden Comb');
await publish('Combo');
check('all four products published', true);
const pub = await api('/products');
check('API now lists 4 published products', pub.data.items.length === 4);
const oil = pub.data.items.find((p) => p.slug === 'hair-oil');
check('oil shows discount 550 (was 600) from the form edit', oil.price === 550 && oil.compareAtPrice === 600, JSON.stringify([oil.price, oil.compareAtPrice]));
check('public API exposes no raw stock numbers', !JSON.stringify(pub).includes('"stock"'));

// 5. Storefront reflects admin edits.
const visitor = await browser.newContext({ viewport: { width: 1280, height: 900 } }); // a fresh visitor with an empty cache
const shop = await visitor.newPage();
shop.on('pageerror', (e) => errors.push('shop pageerror: ' + e));
await shop.goto(site, { waitUntil: 'networkidle' });
await shop.getByRole('button', { name: 'EN', exact: true }).click();
const products = (await shop.locator('#products').innerText()).replace(/\s+/g, ' ');
check('storefront lists oil, powder, comb and combo', ['Hair Oil', 'Hair Powder', 'Wooden Comb', 'Combo'].every((n) => products.includes(n)));
check('storefront shows the edited oil price ৳550 with ৳600 struck through', products.includes('৳550') && products.includes('৳600'));
const offer = (await shop.locator('#offer').innerText()).replace(/\s+/g, ' ');
check('combo is the featured offer at ৳999', offer.includes('৳999'));
check('offer lists the bundle parts and the free-gift comb', offer.includes('Hair Oil') && offer.includes('Wooden Comb') && offer.includes('Free gift'), offer.slice(0, 160));
check('offer shows delivery fees from settings (৳60 / ৳120)', offer.includes('৳60') && offer.includes('৳120'));
await shop.locator('#offer').getByRole('button', { name: /Get the combo/ }).click();
const drawer = shop.getByRole('dialog', { name: 'Your cart' });
await drawer.waitFor();
check('combo in cart: free delivery, total ৳999', (await drawer.innerText()).includes('Free') && (await drawer.innerText()).includes('৳999'));
await shop.keyboard.press('Escape');

// 6. Admin sets the comb to 0 -> combo becomes unavailable on the storefront.
await page.getByRole('link', { name: 'Inventory' }).click();
await page.locator('tr', { hasText: 'HO-COMB' }).getByRole('button', { name: 'Adjust' }).click();
await page.getByLabel('Action').selectOption('set');
await page.getByLabel('New stock count').fill('0');
await page.getByLabel('Reason').fill('sold out of combs');
await page.getByRole('button', { name: 'Save' }).click();
await page.getByText('HO-COMB): 20 → 0').waitFor();
await shop.waitForTimeout(11000); // public catalogue responses are cached for 10s
await shop.reload({ waitUntil: 'networkidle' });
await shop.getByRole('button', { name: 'EN', exact: true }).click();
check('combo shows Out of stock when a part is sold out', (await shop.locator('#offer').getByRole('button', { name: 'Out of stock' }).isDisabled()));
check('stale cart line for the combo is marked unavailable and excluded from total', await (async () => {
  await shop.getByRole('button', { name: 'Open cart' }).click();
  const t = await shop.getByRole('dialog', { name: 'Your cart' }).innerText();
  await shop.keyboard.press('Escape');
  return t.includes('Out of stock');
})());

// 7. Create a brand-new product in the UI; duplicate SKU is rejected.
await page.getByRole('link', { name: 'Products', exact: true }).click();
await page.getByRole('link', { name: 'New product' }).click();
await page.getByLabel('Name (English)').fill('Hair Serum');
await page.getByLabel('SKU').fill('ho-serum-50');
await page.getByLabel('Size label').fill('50 ml');
await page.locator('input[name="variants.0.regularPrice"]').fill('350');
await page.getByLabel('Starting stock').fill('7');
await page.getByLabel('Paste an image URL').fill('/images/hair-oil-bottle.jpg');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.getByLabel('Description (alt text)').fill('Serum bottle');
await page.getByRole('button', { name: 'Create product' }).click();
await page.getByRole('heading', { name: 'Edit product' }).waitFor();
check('new product created and opened for editing (slug hair-serum)', (await page.locator('input[name="slug"]').inputValue()) === 'hair-serum');
await page.getByRole('link', { name: 'Products', exact: true }).click();
await page.getByRole('link', { name: 'New product' }).click();
await page.getByLabel('Name (English)').fill('Another Serum');
await page.getByLabel('SKU').fill('HO-SERUM-50');
await page.getByLabel('Size label').fill('50 ml');
await page.locator('input[name="variants.0.regularPrice"]').fill('350');
await page.getByRole('button', { name: 'Create product' }).click();
await page.getByText(/already exists/).waitFor();
check('duplicate SKU is rejected with a clear message', true);
await page.getByLabel('Name (English)').fill('');
await page.getByRole('button', { name: 'Create product' }).click();
check('client-side validation flags the empty name', await page.getByText('At least 2 characters').isVisible());

await page.screenshot({ path: `${out}/admin-editor.png`, fullPage: true });
await shop.screenshot({ path: `${out}/shop-live.png`, fullPage: true });
check('no unexpected console/page errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);
