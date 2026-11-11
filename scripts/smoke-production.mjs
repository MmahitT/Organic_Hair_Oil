// Read-only smoke test of a LIVE deployment: it never writes data or places orders.
// Usage: node scripts/smoke-production.mjs https://your-domain
const site = (process.argv[2] ?? '').replace(/\/$/, '');
if (!/^(https:\/\/|http:\/\/localhost)/.test(site)) { console.error('Usage: node scripts/smoke-production.mjs https://your-domain'); process.exit(2); }
let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) failed++; };
const get = async (path) => { const r = await fetch(site + path, { redirect: 'manual' }); const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ } return { r, text, json, h: r.headers }; };

const home = await get('/');
check('home page loads (200, HTML)', home.r.status === 200 && /<div id="root"/.test(home.text), `status ${home.r.status} ${home.h.get('x-vercel-error') ?? ''}`);
const csp = home.h.get('content-security-policy') ?? '';
check('security headers are sent (CSP without unsafe-eval/inline scripts, nosniff, frame deny)', /script-src 'self'/.test(csp) && !/script-src[^;]*unsafe/.test(csp) && home.h.get('x-content-type-options') === 'nosniff' && home.h.get('x-frame-options') === 'DENY');
check('HTTPS enforced with HSTS', /max-age=\d+/.test(home.h.get('strict-transport-security') ?? ''));
for (const p of ['/checkout', '/track', '/privacy']) { const d = await get(p); check(`deep link ${p} opens the app (not a 404)`, d.r.status === 200 && /<div id="root"/.test(d.text), `status ${d.r.status}`); }
const health = await get('/api/v1/health');
check('API health: database is up', health.r.status === 200 && health.json?.data?.db === 'up', `status ${health.r.status} ${JSON.stringify(health.json?.data ?? health.text.slice(0, 80))}`);
const products = await get('/api/v1/products');
const items = products.json?.data?.items ?? [];
check('products API returns JSON', products.r.status === 200 && Array.isArray(items), `status ${products.r.status}`);
check('at least one product is published (the store is not empty)', items.length > 0, `${items.length} products`);
check('API responses are not cacheable by browsers/proxies for private data (no-store on health)', /no-store/.test(health.h.get('cache-control') ?? ''));
const zones = await get('/api/v1/delivery/zones');
check('delivery zones and payment methods are configured', zones.r.status === 200 && (zones.json?.data?.zones?.length ?? 0) > 0, `status ${zones.r.status}`);
const cors = await fetch(`${site}/api/v1/products`, { headers: { Origin: 'https://evil.example' } });
check('a foreign website origin is not allowed by CORS', !cors.headers.get('access-control-allow-origin'));
const admin = await fetch(`${site}/api/v1/admin/orders`);
check('admin API refuses anonymous requests (401)', admin.status === 401, `status ${admin.status}`);
const jobs = await fetch(`${site}/api/v1/internal/jobs`);
check('scheduled-jobs endpoint is closed without the secret (404)', jobs.status === 404, `status ${jobs.status}`);
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
