// Usage: node scripts/screenshot.mjs <url> <outDir> — captures full-page shots at key widths and reports horizontal overflow.
import { chromium } from 'playwright-core';

const [url = 'http://localhost:4173/', out = '.'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
for (const w of [360, 390, 768, 1280]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'networkidle' });
  // scroll through so whileInView animations run
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 250)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(700);
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  console.log(w, 'overflow:', overflow.sw > overflow.cw ? `YES ${overflow.sw}>${overflow.cw}` : 'no', 'errors:', errors.length ? errors : 'none');
  await page.screenshot({ path: `${out}/shot-${w}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
