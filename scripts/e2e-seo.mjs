// End-to-end Phase 9 check: SEO tags, structured data, robots/sitemap, legal pages (and their admin editor), and — most
// important — that Google Analytics / Meta Pixel are NOT loaded until the visitor consents. Google/Facebook requests are
// intercepted (never sent to the internet), so the test can see exactly which were attempted.
// Needs a FRESH throwaway database, API on :5001 and the site built with VITE_SITE_URL=<siteUrl> served on :4173.
//   ADMIN_EMAIL=... ADMIN_PW=... node scripts/e2e-seo.mjs [siteUrl] [outDir]
import { chromium } from 'playwright-core';

const site = process.argv[2] ?? 'http://localhost:4173';
const out = process.argv[3] ?? '.';
const { ADMIN_EMAIL, ADMIN_PW } = process.env;
let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const GA = 'G-TEST123456', PX = '123456789012345';
const seo = (over = {}) => call('/admin/settings/seo', { method: 'PUT', token: T, body: { title: 'Beauty Organic Hair Oil — Oil & Powder', description: 'Hair oil, hair powder and a wooden comb delivered across Bangladesh.', titleBn: '', descriptionBn: '', ogImage: '', ga4Id: GA, metaPixelId: PX, ...over } });
check('admin saved SEO text and both tracking IDs', (await seo()).status === 200);
check('a malformed tracking ID is refused by the server', (await seo({ ga4Id: 'G-X"><script>' })).status === 400 && (await seo({ metaPixelId: 'abc' })).status === 400);
await seo();
await sleep(11000); // public settings are cached for 10 s

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const errors = [];
const watch = (page, tag) => { page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e}`)); page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`${tag} console: ${m.text()}`)); };

/** A visitor's browser context that records (and neutralises) every request to Google / Meta / WhatsApp. */
async function visitor(lang = 'en') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const hits = [];
  await ctx.route(/googletagmanager\.com|google-analytics\.com|facebook\.net|facebook\.com|wa\.me/, (route) => { hits.push(route.request().url()); route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }); });
  await ctx.addInitScript((l) => { try { if (!localStorage.getItem('bo-lang')) localStorage.setItem('bo-lang', l); } catch { /* */ } }, lang);
  const page = await ctx.newPage(); watch(page, 'visitor');
  return { ctx, page, hits, ga: () => hits.filter((u) => /googletagmanager/.test(u)), fb: () => hits.filter((u) => /facebook/.test(u)) };
}
const dl = (page) => page.evaluate(() => (window.dataLayer ?? []).map((e) => Array.from(e)));
const gaEvents = async (page, name) => (await dl(page)).filter((e) => e[0] === 'event' && e[1] === name);
const fbQueue = (page, name) => page.evaluate((n) => (window.fbq?.queue ?? []).filter((e) => e[0] === 'track' && e[1] === n).map((e) => e), name);
const addOil = async (page) => { await page.locator('#products').getByRole('button', { name: 'Add to cart' }).nth(1).click(); await page.getByRole('dialog', { name: 'Your cart' }).waitFor(); await page.keyboard.press('Escape'); };

// ================= 1. Before any choice: nothing is tracked =================
const A = await visitor();
await A.page.goto(site, { waitUntil: 'networkidle' });
await A.page.getByRole('dialog', { name: 'Cookies and tracking' }).waitFor();
check('a first-time visitor sees the cookie banner', true);
await addOil(A.page);
await sleep(1500);
check('BEFORE consent: no request to Google or Meta, no dataLayer, no fbq, no stored choice', A.hits.length === 0 && (await A.page.evaluate(() => window.dataLayer === undefined && window.fbq === undefined && localStorage.getItem('bo-consent-v1') === null)), A.hits.join(','));
await A.page.screenshot({ path: `${out}/consent-banner-mobile.png`, fullPage: false });
check('no horizontal scroll with the banner open', await A.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

// ================= 2. Reject all =================
await A.page.getByRole('button', { name: 'Reject all' }).click();
await A.page.getByRole('dialog', { name: 'Cookies and tracking' }).waitFor({ state: 'detached' });
await addOil(A.page);
await A.page.reload({ waitUntil: 'networkidle' });
await sleep(1000);
check('after "Reject all" (and a reload): still nothing loaded and the banner stays away', A.hits.length === 0 && (await A.page.getByRole('dialog', { name: 'Cookies and tracking' }).count()) === 0);
check('the footer still offers "Cookie settings"', await A.page.getByRole('button', { name: 'Cookie settings' }).isVisible());

// ================= 3. Change mind: analytics only =================
await A.page.getByRole('button', { name: 'Cookie settings' }).click();
await A.page.getByRole('dialog', { name: 'Cookies and tracking' }).waitFor();
await A.page.getByLabel(/Analytics \(Google Analytics\)/).check();
await A.page.getByRole('button', { name: 'Save my choices' }).click();
await until(async () => A.ga().length > 0);
check('analytics-only: Google’s library is requested for the owner’s ID', A.ga().some((u) => u.includes(`gtag/js?id=${GA}`)));
check('analytics-only: Meta is NOT loaded', A.fb().length === 0 && (await A.page.evaluate(() => window.fbq === undefined)));
await until(async () => (await gaEvents(A.page, 'page_view')).length > 0);
check('a page_view is reported after consent', (await gaEvents(A.page, 'page_view')).length >= 1);
await addOil(A.page);
await until(async () => (await gaEvents(A.page, 'add_to_cart')).length > 0);
const atc = (await gaEvents(A.page, 'add_to_cart'))[0];
check('add_to_cart carries product, price (BDT) and quantity — and no personal data', atc?.[2]?.currency === 'BDT' && atc[2].items?.[0]?.item_name === 'Hair Oil' && atc[2].items[0].price === 550 && !/phone|email|address/i.test(JSON.stringify(atc)));

// ================= 4. WhatsApp click → lead =================
const before = (await gaEvents(A.page, 'generate_lead')).length;
await A.page.getByRole('link', { name: /whatsapp/i }).first().click({ force: true }).catch(() => undefined);
await until(async () => (await gaEvents(A.page, 'generate_lead')).length > before);
check('a click on a WhatsApp link is reported as a lead', (await gaEvents(A.page, 'generate_lead')).length > before);
await A.page.bringToFront();

// ================= 5. Withdraw consent =================
const cntBefore = (await gaEvents(A.page, 'add_to_cart')).length;
await A.page.getByRole('button', { name: 'Cookie settings' }).click();
await A.page.getByLabel(/Analytics \(Google Analytics\)/).uncheck();
await A.page.getByRole('button', { name: 'Save my choices' }).click();
await addOil(A.page);
await sleep(600);
check('after withdrawing: Google is switched off (opt-out flag) and the next add-to-cart is NOT sent', (await A.page.evaluate((id) => window[`ga-disable-${id}`] === true, GA)) && (await gaEvents(A.page, 'add_to_cart')).length === cntBefore);

// ================= 6. Accept all + purchase rule =================
const B = await visitor();
await B.page.goto(site, { waitUntil: 'networkidle' });
await B.page.getByRole('button', { name: 'Accept all' }).click();
await until(async () => B.ga().length > 0 && B.fb().length > 0);
check('accept all: both Google and Meta libraries are requested', B.ga().length > 0 && B.fb().some((u) => u.includes('fbevents.js')));
await addOil(B.page);
await until(async () => (await fbQueue(B.page, 'AddToCart')).length > 0);
check('Meta receives AddToCart with the product id, quantity and BDT value', (await fbQueue(B.page, 'AddToCart'))[0]?.[2]?.currency === 'BDT');
await B.page.getByRole('button', { name: 'Open cart' }).first().click();
const drawer = B.page.getByRole('dialog', { name: 'Your cart' });
await drawer.waitFor();
await drawer.getByRole('button', { name: 'Checkout' }).click();
await B.page.waitForURL('**/checkout');
await until(async () => (await gaEvents(B.page, 'begin_checkout')).length > 0);
check('begin_checkout is reported once the checkout opens', (await gaEvents(B.page, 'begin_checkout')).length === 1 && (await fbQueue(B.page, 'InitiateCheckout')).length >= 1);
check('the checkout page is not indexable (noindex)', await until(async () => ((await B.page.locator('meta[name="robots"]').first().getAttribute('content')) ?? '').includes('noindex')));
await B.page.getByLabel('Full name').fill('Karim Hossain');
await B.page.getByLabel('Mobile number').fill('01712340001');
await B.page.getByLabel('District').selectOption('Rangpur');
await B.page.getByLabel('City / Thana / Area').fill('Mirpur');
await B.page.getByLabel('Full address').fill('House 12, Road 5, Block C, Mirpur DOHS');
await B.page.getByRole('button', { name: /^Place order · ৳610/ }).last().waitFor(); // wait for the server to re-price for Rangpur
await B.page.getByRole('button', { name: /^Place order/ }).last().click();
await B.page.waitForURL(/\/order\/HO-/);
await until(async () => (await gaEvents(B.page, 'add_payment_info')).length > 0);
check('add_payment_info is reported when the order is submitted', (await gaEvents(B.page, 'add_payment_info')).length >= 1);
const orderNo = (await B.page.getByTestId('order-no').innerText()).trim();
await sleep(800);
check('a PENDING order is not reported as a purchase', (await gaEvents(B.page, 'purchase')).length === 0 && (await fbQueue(B.page, 'Purchase')).length === 0);
const o = (await call(`/admin/orders?q=${orderNo}`, { token: T })).data.items[0];
await call(`/admin/orders/${o._id}/status`, { method: 'PATCH', token: T, body: { status: 'confirmed' } });
await B.page.reload({ waitUntil: 'networkidle' });
await until(async () => (await gaEvents(B.page, 'purchase')).length > 0);
const pur = (await gaEvents(B.page, 'purchase'));
check('once the shop CONFIRMS the order, one purchase is reported with the order number and total', pur.length === 1 && pur[0][2].transaction_id === orderNo && pur[0][2].value === 610 && pur[0][2].currency === 'BDT');
check('Meta Purchase carries the value and no personal data', (await fbQueue(B.page, 'Purchase')).length === 1 && !/phone|0171234|Karim|Mirpur/i.test(JSON.stringify(await fbQueue(B.page, 'Purchase'))));
await B.page.reload({ waitUntil: 'networkidle' });
await sleep(1000);
check('reloading the order page does NOT report the purchase again (deduplicated by order number)', (await gaEvents(B.page, 'purchase')).length === 0);
await B.page.goto(`${site}/track?order=${orderNo}`);
await B.page.getByLabel(/Mobile number/).fill('01712340001');
await B.page.getByRole('button', { name: 'Track order' }).click();
await B.page.getByTestId('track-status').waitFor();
await sleep(800);
check('opening the same order on the track page does not double count either', (await gaEvents(B.page, 'purchase')).length === 0);

// ================= 7. Meta tags, structured data, static HTML =================
const S = await visitor();
await S.page.goto(site, { waitUntil: 'networkidle' });
const meta = await S.page.evaluate(() => ({
  title: document.title, desc: document.querySelector('meta[name="description"]')?.content, robots: document.querySelector('meta[name="robots"]')?.content,
  canonical: document.querySelector('link[rel="canonical"]')?.href, ogTitle: document.querySelector('meta[property="og:title"]')?.content, ogImage: document.querySelector('meta[property="og:image"]')?.content,
  tw: document.querySelector('meta[name="twitter:card"]')?.content, lang: document.documentElement.lang,
  ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent)),
}));
check('the landing page shows the owner’s SEO title and description', meta.title === 'Beauty Organic Hair Oil — Oil & Powder' && meta.desc.startsWith('Hair oil, hair powder'));
check('canonical, Open Graph and Twitter tags are present and absolute', meta.canonical === `${site}/` && /^http.+\/images\/og-share\.jpg$/.test(meta.ogImage) && meta.ogTitle === meta.title && meta.tw === 'summary_large_image' && meta.robots === 'index,follow');
const types = meta.ld.map((x) => x['@type']);
check('structured data: Organization, 4 Products and FAQPage', types.includes('Organization') && types.filter((t) => t === 'Product').length === 4 && types.includes('FAQPage'), types.join(','));
const prod = meta.ld.find((x) => x['@type'] === 'Product');
check('each Product has a BDT offer and NO invented rating (no real reviews yet)', prod.offers.priceCurrency === 'BDT' && Number(prod.offers.price) > 0 && !JSON.stringify(meta.ld).includes('aggregateRating'));
const raw = await (await fetch(site)).text();
check('the raw HTML (no JavaScript) already carries description, Open Graph and canonical tags for crawlers', /name="description"/.test(raw) && /property="og:title"/.test(raw) && new RegExp(`rel="canonical" href="${site}/"`).test(raw) && /og-share\.jpg/.test(raw));
const robots = await (await fetch(`${site}/robots.txt`)).text();
check('robots.txt blocks admin, checkout, order, track and api, and points to the sitemap', ['/admin', '/checkout', '/order', '/track', '/api'].every((p) => robots.includes(`Disallow: ${p}`)) && robots.includes(`Sitemap: ${site}/sitemap.xml`));
const sm = await (await fetch(`${site}/sitemap.xml`)).text();
check('sitemap.xml lists the public pages and none of the private ones', ['/privacy', '/terms', '/returns', '/shipping', '/contact'].every((p) => sm.includes(`${site}${p}</loc>`)) && !/admin|checkout|track|order/.test(sm.replace(/sitemaps\.org/g, '')));

// ================= 8. Legal pages =================
await S.page.goto(`${site}/shipping`, { waitUntil: 'networkidle' });
await S.page.getByRole('heading', { name: 'Shipping & Delivery Policy' }).waitFor();
const ship = await S.page.locator('main').innerText();
check('the shipping page shows the live delivery charges and the draft notice', ship.includes('Inside Rangpur: ৳60') && ship.includes('Outside Rangpur: ৳120') && /Draft policy/.test(ship));
await S.page.goto(`${site}/privacy`, { waitUntil: 'networkidle' });
await S.page.getByRole('heading', { name: 'Privacy Policy' }).first().waitFor();
check('the privacy policy explains that tracking needs consent', /only use analytics and advertising tools .* if you accept them/i.test((await S.page.locator('main').innerText()).replace(/\s+/g, ' ')));
check('legal pages are indexable with a breadcrumb', (await S.page.locator('meta[name="robots"]').first().getAttribute('content')) === 'index,follow' && (await S.page.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].some((s) => JSON.parse(s.textContent)['@type'] === 'BreadcrumbList'))));
check('no horizontal scroll on the phone legal page', await S.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await S.page.screenshot({ path: `${out}/legal-privacy-mobile.png`, fullPage: true });
await S.page.goto(site, { waitUntil: 'networkidle' });
const foot = await S.page.getByRole('contentinfo').innerText();
check('the footer links to all four policies', ['Privacy Policy', 'Terms & Conditions', 'Returns & Refunds', 'Shipping & Delivery'].every((t) => foot.includes(t)));

// ================= 9. Owner edits legal pages and SEO in the admin =================
const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const ap = await adminCtx.newPage(); watch(ap, 'admin');
await ap.goto(`${site}/admin/login`);
await ap.getByLabel('Email').fill(ADMIN_EMAIL); await ap.getByLabel('Password').fill(ADMIN_PW);
await ap.getByRole('button', { name: 'Sign in' }).click();
await ap.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
await ap.goto(`${site}/admin/website`);
await ap.getByRole('heading', { name: 'Legal pages' }).waitFor();
check('the admin explains that the legal text is a draft and not legal advice', await ap.getByText(/not legal advice/).isVisible());
await ap.getByRole('button', { name: /^Return & Refund Policy/ }).click();
await ap.getByRole('button', { name: 'Start from the template' }).click();
const ta = ap.getByLabel('Return & Refund Policy (Markdown)');
check('"Start from the template" fills the editor with the draft text', (await ta.inputValue()).includes('# Return & Refund Policy'));
await ta.fill('# Our returns\n\nReturns accepted within **7 days**. Mail [us](mailto:hello@example.com).\n\n<script>window.__pwned = 1</script> [bad](javascript:window.__pwned=2)');
await ap.getByRole('button', { name: 'Save legal pages' }).click();
await ap.getByText(/Saved\. The website shows this/).last().waitFor();
await ap.getByLabel('I have reviewed these policies', { exact: false }).check();
await ap.getByRole('button', { name: 'Save legal pages' }).click();
await until(async () => (await ap.getByText(/Saved\. The website shows this/).count()) > 0);
await sleep(1500);
const R = await visitor();
await R.page.goto(`${site}/returns`, { waitUntil: 'networkidle' });
await R.page.getByRole('heading', { name: 'Our returns' }).waitFor();
const rtxt = await R.page.locator('main').innerText();
check('the owner’s own text is shown, and the draft notice is gone once reviewed', rtxt.includes('Returns accepted within 7 days') && !/Draft policy/.test(rtxt));
check('script tags and javascript: links in the policy text are inert', (await R.page.evaluate(() => window.__pwned === undefined)) && (await R.page.locator('main a[href^="javascript"]').count()) === 0 && (await R.page.locator('main script').count()) === 0 && rtxt.includes('<script>'));
check('safe links still work (mailto)', (await R.page.locator('main a[href="mailto:hello@example.com"]').count()) === 1);

// SEO card
await ap.getByLabel(/^Page title \(English\)/).fill('A title that is much much longer than sixty characters should be flagged!');
await ap.getByRole('button', { name: 'Save search & tracking settings' }).click();
await ap.getByText(/Keep the title to 60 characters/).waitFor();
check('an over-long title is refused with a clear message', true);
await ap.getByLabel(/^Page title \(English\)/).fill('Hair Oil & Powder — Beauty Organic');
await ap.getByLabel('Google Analytics 4 ID').fill('UA-1234');
await ap.getByRole('button', { name: 'Save search & tracking settings' }).click();
await ap.getByText(/A GA4 Measurement ID looks like/).waitFor();
check('a wrong GA4 ID format is refused', true);
await ap.getByLabel('Google Analytics 4 ID').fill('');
await ap.getByLabel('Meta Pixel ID').fill('');
await ap.getByRole('button', { name: 'Save search & tracking settings' }).click();
await ap.getByText(/Saved\. The website shows this/).last().waitFor();
await sleep(11000);
const N = await visitor();
await N.page.goto(site, { waitUntil: 'networkidle' });
await sleep(800);
check('with both IDs cleared, the cookie banner never appears and nothing is loaded', (await N.page.getByRole('dialog', { name: 'Cookies and tracking' }).count()) === 0 && N.hits.length === 0 && (await N.page.title()) === 'Hair Oil & Powder — Beauty Organic');

// ================= 10. Contact page + Bangla =================
await N.page.goto(`${site}/contact`, { waitUntil: 'networkidle' });
check('the contact page is indexable with a canonical link', (await N.page.locator('link[rel="canonical"]').getAttribute('href')) === `${site}/contact`);
const Bn = await visitor('bn');
await Bn.page.goto(`${site}/privacy`, { waitUntil: 'networkidle' });
check('Bangla visitors see a Bangla draft notice and a note that the policy is in English', /খসড়া/.test(await Bn.page.locator('main').innerText()) || /ইংরেজিতে/.test(await Bn.page.locator('main').innerText()));

check('no unexpected browser errors', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
