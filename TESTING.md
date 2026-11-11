# Testing Guide & Results

_Phase 10 · 2026-11-11_

## How to run everything

| What | Command | Needs | Time |
|---|---|---|---|
| Type check + lint | `npm run typecheck` · `npm run lint` | — | ~20 s |
| Unit, component, API, database, security, concurrency tests | `npm test` | — (uses an in-memory MongoDB replica set) | ~1 min |
| Dependency audit | `npm audit` · `npm audit --omit=dev` | internet | seconds |
| Secret scan (repo + built website) | `node scripts/scan-secrets.mjs` | built site optional | seconds |
| **Everything in a real browser + load test + secret scan** | `sh scripts/run-all-e2e.sh` | dev MongoDB running (`npm run dev:db`), Google Chrome, `server/.env` | ~25 min |
| One browser script | see the header of each `scripts/e2e-*.mjs` | fresh throwaway DB + API restarted | 1–6 min |
| Lighthouse (mobile) | `npx lighthouse@12 <url> --only-categories=seo,accessibility,best-practices,performance` | built site served | ~1 min |

Browser tests always use a **throwaway database** (`beauty_organic_verify_all`), never your real one. Google/Meta requests are intercepted in tests, so nothing is sent to them.

## Spec §17 coverage map

| §17 area | Where it is tested |
|---|---|
| Frontend unit/component (Vitest + RTL), forms, cart logic | `client/src/**/*.test.ts(x)` — 81 tests (cart, pricing, catalog store, phone, coupon box, checkout notices, track, contact, review form, payment panel, cookie banner, consent/analytics, structured data, safe Markdown) |
| Accessibility (jest-axe) | `client/src/a11y.test.tsx` — 15 checks, English **and** Bangla (cookie banner + settings, contact, legal page, tracking, review form, coupon box, bank and bKash payment panels). Colour contrast is checked in a real browser by Lighthouse (below). |
| Backend unit (pricing, coupons, inventory, zones, status transitions) | `server/src/checkout.test.ts`, `orders.test.ts`, `catalog.test.ts`, `admin.test.ts` |
| API/integration (Supertest + replica-set MongoDB), all endpoints incl. errors | every `server/src/*.test.ts` — 220 tests |
| Authentication (login, lockout, refresh rotation, RBAC denial, forged/expired tokens) | `auth.test.ts`, `security.test.ts`, `hardening.test.ts` (route-by-route permission matrix) |
| Database (schemas, unique indexes, transactions, concurrency) | `models.test.ts`, `checkout.test.ts`, `hardening.test.ts › concurrency` |
| Checkout (totals, coupon, zone fee, idempotency, price tamper) | `checkout.test.ts`, `e2e-checkout.mjs`, `e2e-scenarios.mjs` |
| Manual payments | `payments.test.ts`, `e2e-manual-payments.mjs` |
| Admin (CRUD, roles, exports, payment verification) | `admin.test.ts`, `orders.test.ts`, `e2e-catalog.mjs`, `e2e-staff.mjs`, `e2e-admin.mjs` |
| Responsive 360/390/768/1024/1280 | `e2e-responsive.mjs` — storefront + 12 admin screens at all five widths, no sideways scroll, tap-target check on the main button |
| Security (injection, XSS, rate limits, CORS, headers, audit, secrets, IDOR) | `hardening.test.ts`, `security.test.ts`, `e2e-csp.mjs`, `scripts/scan-secrets.mjs`, `SECURITY_REVIEW.md` |
| Concurrency (50 parallel orders for stock of 10) | `hardening.test.ts` (in-process) and `scripts/load-concurrency.mjs` (real HTTP, plus read-load latency) |

## The 13 key E2E scenarios (Spec §17)

| # | Scenario | Covered by |
|---|---|---|
| 1 | Guest COD order on mobile → admin sees it → status flow to Delivered → stock correct | `e2e-checkout.mjs`, `e2e-orders.mjs` |
| 2 | Online payment success | **Not applicable** — the payment gateway was removed (owner decision). Manual equivalent: claim → admin verification → paid (`e2e-manual-payments.mjs`) |
| 3 | Payment failure/cancel → stock released, order not paid | Manual equivalent: unclaimed order expires and returns stock (`payments.test.ts`), rejected claim can be resubmitted (`e2e-manual-payments.mjs`) |
| 4 | Duplicate callback / refresh → no double deduction | Idempotency + duplicate guard (`checkout.test.ts`, `load-concurrency.mjs`: 20 identical submissions → one order); duplicate admin decisions (`hardening.test.ts`) |
| 5 | Tampered price/delivery fee ignored or rejected | `checkout.test.ts`, `e2e-checkout.mjs` (forged `expectedTotal`) |
| 6 | Out of stock during checkout → graceful error | `e2e-scenarios.mjs` (item sells out while the customer is on the checkout page) |
| 7 | Coupon valid / expired / limit reached | `checkout.test.ts` (rules), `e2e-scenarios.mjs` (what the customer sees), `e2e-admin.mjs` (coupons screen) |
| 8 | Manual payment order stays pending until admin verification | `payments.test.ts`, `e2e-manual-payments.mjs` |
| 9 | Tracking with wrong phone → generic not found; rate limit triggers | `orders.test.ts`, `hardening.test.ts`, `e2e-orders.mjs` |
| 10 | Review submit → pending → approve → appears; rating updates | `orders.test.ts`, `e2e-orders.mjs` |
| 11 | Cancel/return flows restore stock appropriately | `orders.test.ts`, `e2e-orders.mjs` |
| 12 | Admin staff cannot access settings/users | `hardening.test.ts` (every route), `e2e-admin.mjs`, `e2e-staff.mjs` |
| 13 | Cart persistence across reload; cookie consent gates analytics | `e2e-scenarios.mjs` (cart), `e2e-seo.mjs` (consent gating, 46 checks) |

## Results (2026-11-11)

**Automated gates**
- `npm run typecheck`, `npm run lint`: 0 errors.
- `npm test`: **client 81 passed · server 220 passed** (Vitest 4.1.12).
- `npm audit`: 0 critical, 0 high, 7 moderate (one dev-only lint-tool dependency; see `SECURITY_REVIEW.md` §2); production dependencies 0.
- `node scripts/scan-secrets.mjs`: 235 source files + built website scanned against the real values in `server/.env` — no secrets found.

**Browser, load and Lighthouse results:** see the section "Full browser run" below (filled in from the last `run-all-e2e.sh`).

**Lighthouse (mobile, simulated slow 4G, landing page):** SEO 100 · Accessibility 100 · Best Practices 100 · Performance 77 (LCP 6.0 s). The performance target (LCP < 2.5 s) is **not met yet**; cause and plan are in `DEVELOPMENT_PROGRESS.md`.

## Full browser run (2026-11-11, `sh scripts/run-all-e2e.sh`)

All passed in one clean run: catalog 25 · staff 6 · checkout 31 · manual payments 37 · orders 32 · admin 45 · SEO/consent 46 · CSP 12 · scenarios 12 · responsive 11 (5 widths) · load/concurrency · secret scan. Earlier runs showed an intermittent failure in the manual-payments script; the cause was the test reading the Payments page before it finished loading and using fixed sleeps. The script now waits for real conditions (no app change needed).

## What still needs a person

- Real phones and a real network (the tests use desktop Chrome with phone-sized screens).
- Printing/saving the invoice as PDF on paper or other browsers.
- Image upload against a real Cloudinary account (no account yet).
- A professional penetration test and legal review of the policy pages before launch.
