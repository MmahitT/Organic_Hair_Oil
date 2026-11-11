// Browser smoke test for the Phase 2 landing page. Usage: node scripts/smoke-test.mjs [url]
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) failed++; };

await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// Order Now (sticky bar) adds combo and opens drawer
await page.getByRole('button', { name: 'অর্ডার করুন', exact: true }).last().click();
const drawer = page.getByRole('dialog', { name: 'আপনার কার্ট' });
await drawer.waitFor();
check('drawer opens with combo', (await drawer.innerText()).includes('কম্বো'));
check('combo total ৳999 & free delivery', (await drawer.innerText()).includes('৯৯৯') && (await drawer.innerText()).includes('ফ্রি'));
// WhatsApp order link
const href = await drawer.getByRole('link', { name: 'হোয়াটসঅ্যাপে অর্ডার করুন' }).getAttribute('href');
check('whatsapp order link', href.startsWith('https://wa.me/8801857164863?text='));
// Remove combo -> empty state
await drawer.getByRole('button', { name: /সরান/ }).click();
check('empty state shown', (await drawer.innerText()).includes('আপনার কার্ট খালি'));
await page.keyboard.press('Escape');

// Add a single oil via product card -> delivery fee 60 inside Rangpur, 120 outside
await page.locator('#products').getByRole('button', { name: 'কার্টে যোগ করুন' }).nth(1).click();
await drawer.waitFor();
let txt = await drawer.innerText();
check('oil: ৳550 + ৳60 = ৳610', txt.includes('৬১০'), '');
await drawer.getByText('রংপুরের বাইরে').click();
txt = await drawer.innerText();
check('outside Rangpur: ৳670', txt.includes('৬৭০'));

// Persistence across reload
await page.reload({ waitUntil: 'networkidle' });
const badge = await page.locator('header button[aria-label]').filter({ has: page.locator('span') }).first().innerText();
check('cart persists after reload', badge.trim() === '১', badge);

// Language toggle
await page.getByRole('button', { name: 'EN', exact: true }).click();
check('switches to English', (await page.locator('h1').innerText()).includes('Nourish'));
check('html lang=en', (await page.evaluate(() => document.documentElement.lang)) === 'en');

// FAQ accordion
const q = page.getByRole('button', { name: 'What are the delivery charges?' });
await q.scrollIntoViewIfNeeded();
await q.click();
check('FAQ expands', (await q.getAttribute('aria-expanded')) === 'true');

// Gallery lightbox + Esc
await page.locator('#gallery li button').first().scrollIntoViewIfNeeded();
await page.locator('#gallery li button').first().click();
check('lightbox opens', await page.getByRole('dialog').isVisible());
await page.keyboard.press('Escape');
check('lightbox closes on Esc', !(await page.getByRole('dialog').count()));

check('no console/page errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);
