// Load + concurrency check against a RUNNING API (real HTTP, real MongoDB). Needs a throwaway database.
//   1. 50 simultaneous orders for 10 units of stock → exactly 10 orders succeed, 40 refused, stock ends at exactly 0.
//   2. Read load on the public catalogue/quote endpoints → no errors, latency percentiles printed.
// Each request carries its own X-Forwarded-For so the per-IP rate limiter (which protects the real site) does not
// distort the test: start the API with TRUST_PROXY=true. Usage:
//   TRUST_PROXY=true (API)  ADMIN_EMAIL=... ADMIN_PW=... node scripts/load-concurrency.mjs [apiBase]
const base = process.argv[2] ?? 'http://localhost:5001/api/v1';
const { ADMIN_EMAIL, ADMIN_PW } = process.env;
let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) failed++; };
let ipN = 1;
const nextIp = () => `10.${(ipN >> 16) & 255}.${(ipN >> 8) & 255}.${ipN++ & 255}`;
const call = async (path, { method = 'GET', body, token, ip = nextIp() } = {}) => {
  const t0 = performance.now();
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-Forwarded-For': ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return { status: res.status, ms: performance.now() - t0, ...json };
};
const pct = (arr, p) => [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))];

const T = (await call('/auth/admin/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PW } })).data?.accessToken;
if (!T) { console.log('FAIL could not sign in (restart the API to clear the admin-login limiter)'); process.exit(1); }
const products = (await call('/admin/products?limit=50', { token: T })).data.items;
const oil = products.find((p) => p.slug === 'hair-oil');
for (const p of products) await call(`/admin/products/${p._id}`, { method: 'PATCH', token: T, body: { visibility: 'published' } });
const sku = oil.variants[0].sku;
const stockNow = async () => (await call('/admin/inventory', { token: T })).data.items.find((i) => i.productId === oil._id).stock;
await call(`/admin/inventory/${oil._id}/${sku}`, { method: 'PATCH', token: T, body: { set: 10, note: 'load test' } });
check('stock set to 10', (await stockNow()) === 10);

// ---------- 1. 50 simultaneous orders ----------
const t0 = performance.now();
const results = await Promise.all(Array.from({ length: 50 }, (_, i) => call('/checkout', { method: 'POST', body: {
  idempotencyKey: crypto.randomUUID(), items: [{ productId: oil._id, sku, qty: 1 }],
  customer: { name: `Buyer ${i}`, phone: `0171${String(8000000 + i)}`, district: 'Rangpur', city: 'Mirpur', address: 'House 12, Road 5, Mirpur DOHS' }, paymentMethod: 'cod', allowDuplicate: true } })));
const wall = performance.now() - t0;
const ok = results.filter((r) => r.status === 201), refused = results.filter((r) => r.status === 422 && r.error?.code === 'INSUFFICIENT_STOCK');
console.log(`  50 parallel checkouts finished in ${Math.round(wall)} ms (p50 ${Math.round(pct(results.map((r) => r.ms), 50))} ms, p95 ${Math.round(pct(results.map((r) => r.ms), 95))} ms)`);
check('exactly 10 orders succeeded', ok.length === 10, `got ${ok.length}`);
check('the other 40 were refused cleanly (422 INSUFFICIENT_STOCK) — no 5xx, no timeouts', refused.length === 40 && results.every((r) => r.status < 500), results.filter((r) => r.status !== 201 && r.status !== 422).map((r) => r.status).join(','));
check('stock ended at exactly 0 (never negative, nothing lost)', (await stockNow()) === 0);
const orders = (await call('/admin/orders?limit=100', { token: T })).data.items.filter((o) => o.customer?.name?.startsWith('Buyer '));
check('exactly 10 orders exist and all have distinct order numbers', orders.length === 10 && new Set(orders.map((o) => o.orderNo)).size === 10);
const replayKey = crypto.randomUUID();
await call(`/admin/inventory/${oil._id}/${sku}`, { method: 'PATCH', token: T, body: { set: 5, note: 'idempotency check' } });
const same = await Promise.all(Array.from({ length: 20 }, () => call('/checkout', { method: 'POST', body: { idempotencyKey: replayKey, items: [{ productId: oil._id, sku, qty: 1 }], customer: { name: 'Same Buyer', phone: '01799999999', district: 'Rangpur', city: 'Mirpur', address: 'House 12, Road 5, Mirpur DOHS' }, paymentMethod: 'cod', allowDuplicate: true } })));
check('20 identical submissions (same idempotency key) create ONE order and take ONE unit', new Set(same.filter((r) => r.status === 200 || r.status === 201).map((r) => r.data.orderNo)).size === 1 && (await stockNow()) === 4);

// ---------- 2. read load ----------
const reads = [];
const t1 = performance.now();
let inflight = 0, sent = 0, errors = 0;
await new Promise((resolve) => {
  const TOTAL = 400, CONC = 25;
  const next = () => {
    while (inflight < CONC && sent < TOTAL) {
      const i = sent++; inflight++;
      const path = i % 3 === 0 ? '/products' : i % 3 === 1 ? '/settings/public' : '/cart/quote';
      call(path, path === '/cart/quote' ? { method: 'POST', body: { items: [{ productId: oil._id, sku, qty: 1 }], district: 'Rangpur' } } : {}).then((r) => { reads.push(r.ms); if (r.status >= 400) errors++; }).finally(() => { inflight--; if (sent >= TOTAL && inflight === 0) resolve(); else next(); });
    }
  };
  next();
});
const wall2 = performance.now() - t1;
console.log(`  400 reads at concurrency 25: ${Math.round(400 / (wall2 / 1000))} req/s, p50 ${Math.round(pct(reads, 50))} ms, p95 ${Math.round(pct(reads, 95))} ms, max ${Math.round(Math.max(...reads))} ms`);
check('no errors under read load', errors === 0, `${errors} errors`);
check('p95 latency under 800 ms for catalogue and quote reads', pct(reads, 95) < 800, `${Math.round(pct(reads, 95))} ms`);
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
