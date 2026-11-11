# Beauty Organic Hair Oil — Online Store

See `PROJECT_SPECIFICATION.md` (requirements) and `CLAUDE.md` (development rules). Progress: `DEVELOPMENT_PROGRESS.md`.

## Run locally
```bash
npm install
cp server/.env.example server/.env   # then set JWT secrets + SEED_ADMIN_* (see file)
npm run dev:db         # local MongoDB (leave running in its own terminal)
npm run seed           # creates catalogue, settings, first superadmin (safe to re-run)
npm run dev            # client http://localhost:5173 + API http://localhost:5001
npm run typecheck && npm run lint && npm test
npm run build
npm run images         # regenerate optimised photos from docs/brand-assets
```
Copy `.env.example` to `.env` (server) and `client/.env.example` to `client/.env`. Never commit real secrets.

## Tests and security checks
```bash
npm run typecheck && npm run lint && npm test      # all unit/API/security tests (client 81, server 220)
npm audit                                          # dependency audit
node scripts/scan-secrets.mjs                      # secret scan of the repo + the built website
sh scripts/run-all-e2e.sh                          # every browser test + load/concurrency test (~25 min, own API port 5002)
sh scripts/run-all-e2e.sh ./out e2e-seo e2e-csp    # or only some of them
```
See `TESTING.md` (what each test covers) and `SECURITY_REVIEW.md` (the security checklist).

## Browser checks (needs Google Chrome)
```bash
# Full catalogue/admin e2e — run against a THROWAWAY database, never your real one:
MONGODB_DB_NAME=beauty_organic_verify npm run seed          # then start API (npm run dev:server) + site (preview)
ADMIN_EMAIL=... ADMIN_PW=... node scripts/e2e-catalog.mjs   # reads credentials from server/.env values
ADMIN_EMAIL=... ADMIN_PW=... node scripts/e2e-staff.mjs
ADMIN_EMAIL=... ADMIN_PW=... node scripts/e2e-checkout.mjs  # real COD purchase + admin view (use a FRESH throwaway DB each run)
```
```bash
# Phase 7 orders/tracking/reviews e2e (fresh throwaway DB; takes ~3 min because it waits out the 5-per-minute tracking limit)
ADMIN_EMAIL=... ADMIN_PW=... node scripts/e2e-orders.mjs
```
```bash
# Manual payments (COD / bKash / bank) e2e — fresh throwaway DB
ADMIN_EMAIL=... ADMIN_PW=... node scripts/e2e-manual-payments.mjs
```
```bash
# Phase 8 admin e2e — fresh throwaway DB; API must be restarted first (admin-login rate limit is 8 per 15 minutes)
ADMIN_EMAIL=... ADMIN_PW=... node scripts/e2e-admin.mjs
```
```bash
# Phase 9 SEO/consent e2e — build with the site address so canonical/sitemap exist; Google/Meta requests are intercepted
VITE_SITE_URL=http://localhost:4173 npm run build -w client
ADMIN_EMAIL=... ADMIN_PW=... node scripts/e2e-seo.mjs
```
```bash
npm run build -w client && npx -w client vite preview --port 4173
node scripts/smoke-test.mjs        # interaction smoke test
node scripts/screenshot.mjs http://localhost:4173/ <outDir>   # responsive screenshots + overflow check
```
