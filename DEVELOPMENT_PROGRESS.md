# DEVELOPMENT_PROGRESS.md

_Last updated: 2026-11-11 (Phase 10)_

## Current Phase
**Phase 10 — Testing & security: implemented and verified; awaiting owner review/approval.** Phase 11 (deployment) has not been started. See `SECURITY_REVIEW.md` (Spec §14 item by item) and `TESTING.md` (Spec §17 map, commands, results).

## Completed (verified)
**Phase 1 (setup)**
- npm-workspaces monorepo (`client`, `server`), TypeScript strict, ESLint, Vitest, `.gitignore`, `.env.example`.
- Express skeleton: Helmet, CORS allow-list, validated env (fail-fast), JSON 404, central error handler, `/api/v1/health`.

**Phase 2 (landing page)**
- Design system: Tailwind tokens (forest/sage/cream/gold/charcoal), Playfair Display + Inter + Hind Siliguri (Bangla), Button/Accordion/Reveal/SectionHeading/ProductImage primitives.
- All 14 sections: announcement bar, navbar, hero, trust indicators, product intro (combo + 3 singles), benefits, ingredients, how to use, gallery (lightbox), reviews (honest empty state), offers (৳999 combo + delivery table), FAQ, final CTA, footer; plus sticky mobile order bar and floating WhatsApp button.
- Bangla (default) + English with language toggle; Bangla digits.
- Cart drawer UI (client-side): add/remove/qty, zone picker (৳60 / ৳120, free with combo), display-only totals, "Order on WhatsApp" with prefilled message. Cart persists (ids + qty only).
- Logo mark extracted from box photo → `client/src/assets/logo-mark.png` (forest green, transparent). Photos optimised to WebP+JPEG in `client/public/images/`.

**Phase 3 (database & backend)**
- 15 Mongoose collections with validation, indexes, unique constraints, timestamps: User, Admin, Category, Ingredient, Product (variants, bundles), Order, Payment, Review, Coupon (+CouponRedemption), Address, Notification, WebsiteSettings, AuditLog, Counter, InventoryMovement.
- Auth: customer register/login, admin login (lockout after 5 failures), refresh-token rotation with reuse detection, logout, `/me`, change-password; bcrypt (bcryptjs), JWT access (15 min) + httpOnly refresh cookie, CSRF header on cookie endpoints.
- RBAC: deny-by-default `/admin` router; staff management + audit log superadmin-only; accounts are re-checked in the DB on every request (disabling takes effect immediately).
- Security middleware: Helmet, CORS allow-list, global + per-route rate limits, body-size limit, NoSQL sanitisation (`sanitizeFilter`, `express-mongo-sanitize`), Zod validation, central error handler, request-ID structured logging with secret redaction, audit logging.
- Idempotent seed (never overwrites admin edits): owner-confirmed catalogue (oil ৳550/200 ml, powder ৳500/225 g, comb ৳150, combo ৳999 bundle with free-delivery flag + gift comb), delivery zones ৳60/৳120, WhatsApp number, first superadmin from env. Products seed as **draft with zero stock** (real stock unknown).
- Local dev DB: `npm run dev:db` (persistent single-node replica set). Production = MongoDB Atlas.

**Phase 4 (product management)**
- Public API: published-only product list/detail/featured, categories, ingredients, `/settings/public` (business info + delivery fees). Computes effective price (discount windows), stock status, per-line max, bundle availability from components, bundle "worth" value. No exact stock exposed.
- Admin API (RBAC): product CRUD with archive, unique slug/SKU (409), image-URL allow-list, publish guards, bundle validation; transactional inventory service (atomic conditional updates; 50 parallel purchases vs 10 in stock → exactly 10 succeed); movement log; ingredients/categories CRUD; Cloudinary signed-upload endpoint (signature algorithm verified against Cloudinary's documented example); audit log with before/after for price and stock changes.
- Storefront now runs on live data: products, prices, stock states, featured offer, bundle contents, ingredients, delivery fees, WhatsApp number all come from the API (nothing hardcoded); loading/error/empty states; cart reconciles against the live catalogue and marks sold-out lines.
- Admin app at `/admin` (separate 54 kB chunk, noindex): login (lockout messages), role-aware shell, Products list (search/filter/pagination), full Product editor (variants, discounts with dates, images with upload/paste URL/reorder/primary, bundle composition, ingredients, visibility flags, SEO, archive), Inventory (adjust add/remove/set with required reason, history), Ingredients.
- Seed now includes images + bilingual descriptions and safely backfills untouched seeded products.

**Phase 5 (cart & checkout)**
- Server pricing engine (`/cart/quote`): all money from the database; delivery by district/zone (৳60 / ৳120, free with combo); product discounts; coupons (percent/fixed/free-delivery, min order, limits, per-customer, product-specific); stock clamping with warnings. Client-supplied prices/fees are ignored.
- Coupons admin API + coupon validation endpoint.
- `/checkout` (COD): single transaction (re-price, atomic stock for every bundle part, coupon claim, order, COD payment, inventory movements); idempotency (replay returns the original order; simultaneous double-submit creates one); duplicate-order guard (same phone + same cart within 2 min, customer can confirm); `expectedTotal` guard (PRICE_CHANGED); blocked-customer check; COD enabled/max-amount settings; auto-confirm setting; order number `HO-YYMMDD-XXXXX`.
- Signed order token + limited, masked order-status endpoint.
- Storefront: cart drawer uses server prices with coupon box and Checkout button; checkout page (validated Bangla/English form with all 64 districts, draft autosave, live server summary with quantity steppers, coupon, error handling for stock/price/duplicate/coupon/network); order confirmation page (private, survives reload, safe fallback without token).
- Admin: read-only Orders list (search/filter/pagination) and order detail with address, packing list, totals and history. Admin now lands on Orders.

**Phase 6 (payments) — superseded.** The SSLCOMMERZ gateway built here was **deleted entirely on 2026-11-11** at the owner's request (adapter, routes, IPN/callback handlers, reconciliation, env variables, settings, UI, tests, stand-in gateway script). What remains from Phase 6: prepaid orders hold stock and are released by the expiry job (`reservationExpiresAt`), the manual bKash/Nagad/Rocket flow, and the Payments admin page — see "Manual payment system" below.

**Phase 7 (orders, tracking, reviews, notifications)**
- Order workflow with forward-only transitions, history with who/when, payment gate, COD collected on delivery; admin cancel (restock + coupon + refund flag) and return (restock choice); customer cancel/return requests with admin approve/decline; courier/tracking fields, internal notes, address correction before shipping.
- Customer tracking page `/track` (order number + phone, rate limited, no enumeration, no address), order-page links, invoice page (HTML, print/PDF), order history API for logged-in customers.
- Admin: order detail actions, WhatsApp confirm messages (বাংলা/English), "Needs your attention" strip and menu badges, order settings (auto-confirm, return window), CSV export, Reviews moderation page.
- Reviews: verified buyers only, moderated, shown on the landing page (honest empty state remains until the first approval); ratings aggregate per product.
- Notification queue + provider interfaces (no provider yet → messages wait); processed by the 60 s background job.

**Manual payment system (owner request, 2026-11-11 — no paid gateway)**
- Methods: Cash on Delivery, manual bKash (also Nagad/Rocket), manual bank transfer; each switched on/off and configured in Admin → Payments (numbers, bank name/account name/number/branch, instructions per method). Details live in the database only; a method cannot be switched on without its details.
- Checkout shows the owner's instructions and account details for the chosen method; after ordering the customer enters the transaction/reference ID (+ optional payment reference, sender number/name).
- A submission only records a claim: payment stays **Pending**, the order cannot be processed (`PAYMENT_REQUIRED`), and only an admin's **Verify** (after checking the real bKash/bank record) marks it paid. Reject lets the customer resubmit. Unique transaction IDs.
- Statuses shown as Pending / Verified / Failed / Refunded (+ Partly refunded, Refund due); refunds are *recorded* (admin only, partial or full, never above the amount paid, atomic) — the system never moves money.
- Payment history with timestamps and who did what; COD is a separate type (Payments filter + Orders "COD only / Prepaid only").
- The SSLCOMMERZ gateway was removed completely (see Phase 6 note).

**Phase 8 (admin dashboard)**
- Dashboard: revenue (definition shown), orders by status, pending now, average order value, new vs returning customers, COD vs prepaid, daily revenue chart (plain SVG), best sellers, low stock, recent orders; Today / 7 days / 30 days / custom range (Bangladesh days).
- Customers (derived from orders): list with search/sort/blocked filter, detail with order history, private notes, block/unblock (also blocks sign-in), CSV export (admin-only, audit-logged).
- Contact page + Messages inbox (honeypot, rate limit, WhatsApp link, new/read/done).
- Coupons screen (create/edit/turn on-off, usage) on top of the existing API.
- Website screen: business details (shown in footer/invoices), delivery zones/fees/districts (answers the "which districts are Inside Dhaka" question — the owner decides here), announcement bar (EN + বাংলা, link, expiry), owner-edited FAQ.
- Team (superadmin): add staff/admin, change role, disable (ends sessions). Activity log (superadmin): searchable audit trail incl. before/after.
- Orders: date range, district, payment method, sort; payments/inventory/orders/customers CSV exports. Role-aware menu with badges; staff land on Orders and cannot reach manager pages (UI and server).

**Phase 9 (SEO, analytics, legal pages)**
- Meta tags, canonical, Open Graph/Twitter, robots meta, JSON-LD (Organization, Product with BDT offers, FAQPage, BreadcrumbList; rating only from real reviews), robots.txt + sitemap.xml at build, 1200×630 share image; owner-editable SEO text/image in admin.
- Cookie consent banner (Accept all / Reject all / Choose; footer "Cookie settings"); Google Analytics 4 and Meta Pixel load **only after consent** and only if the owner set the IDs; withdrawal switches them off; no personal data sent.
- Conversion events: page_view, view_item, add_to_cart, begin_checkout, add_payment_info, generate_lead (WhatsApp clicks), purchase (accepted orders only, once per order number).
- Legal pages (Privacy, Terms, Returns & Refunds, Shipping) with safe Markdown rendering, built-in draft templates with a visible draft notice (no invented claims), live details filled from settings, admin editor with "reviewed" confirmation; footer links; contact page shows the owner's details.

**Phase 10 (testing & security)**
- **Security review of every Spec §14 item** (`SECURITY_REVIEW.md`), each backed by a test or browser run. Found and fixed: order/invoice tokens appeared in access-log URLs; personal data (phones/emails) could appear in error logs; personal-data API responses were cacheable; contact-message status changes were not audited; production boot checks were too lenient (now refuses weak bcrypt, identical/placeholder JWT secrets, non-https CORS/frontend URL); logger redaction missed top-level fields.
- **Permission matrix test**: every admin route is inventoried automatically — anonymous 401 on all 62, staff 403 except the documented list, team/activity superadmin-only, customer tokens never accepted. A new route without a decision fails the build.
- New hardening tests (29): IDOR table, injection/XSS/prototype-pollution corpus, mass assignment, caching headers, log scrubbing, rate limits on every sensitive endpoint, audit-trail coverage, **50 parallel orders vs 10 units**, production boot refusal (real process).
- Website **Content-Security-Policy** (`client/security-headers.ts`; no inline script, no eval; also written to `dist/_headers` for the host) verified in a real browser across customer + admin journeys; Zod's JIT (which needs eval) switched off.
- Accessibility tests with jest-axe (15 checks, English + Bangla); Lighthouse a11y 100.
- Responsive test: storefront + 12 admin screens at 360/390/768/1024/1280; scenario tests (cart persistence, coupon outcomes, item sells out mid-checkout); real-HTTP load/concurrency script; secret scanner (repo + built website vs real `.env` values); one-command full browser run `scripts/run-all-e2e.sh` (own API port, so the dev stack can stay up).
- Dependencies: Vitest 3 → 4.1.12 (fixes a critical dev-only `tinypool` RCE advisory), `sharp` → 0.35.5 (high, dev-only). `npm audit`: **0 critical / 0 high**, 7 moderate (one nested dev-only `minimatch`, see SECURITY_REVIEW.md §2); production dependencies 0.

## In progress / Pending
- Phase 11 (deployment) — not started. Deployment items from the security review: host sends `client/dist/_headers`, HTTPS/HSTS, `TRUST_PROXY`, same registrable domain for site + API, shared rate-limit store if more than one API instance, Atlas network restriction, backups, secret manager.
- **Performance target not met:** Lighthouse mobile LCP 6.0 s (target < 2.5 s). Cause: page shows a splash until the shop data arrives and then React renders the hero. Plan: render the shell/hero immediately with skeletons, lazy-load below-the-fold sections, smaller entry bundle. Decide whether to do this before launch.
- **To finish SEO at launch:** owner sets the real domain (`VITE_SITE_URL` at build → canonical, sitemap), enters GA4/Meta Pixel IDs (optional), writes/approves the four legal pages (legal review recommended), and confirms the share image.
- Still code-only (English/Bangla copy files, not editable in admin): hero, benefits, how-to-use, ingredient card text, trust points, gallery, offers copy. Ask the owner whether editing these is needed before launch.
- Owner alerts: no automatic WhatsApp/SMS/email yet (needs a paid provider — Q9). The owner watches the Admin menu badge / Orders page and confirms each order on WhatsApp via the prefilled message button.
- Deferred: forgot/reset password and phone/email verification (need an email/SMS provider).
- **To go live with products:** owner enters stock in Admin → Inventory and sets products to Published (all 4 are currently drafts with 0 stock, so the public shop shows its "products are being updated" state).
- Not verified against the real service: Cloudinary image upload (no account yet) — only the signature and error paths are tested.
- Admin UI is English-only; categories screen, related products, benefits/how-to editing are deferred (Phase 8).
- Deferred from Phase 3 to Phase 7: forgot/reset-password (needs email/SMS provider), phone/email verification.
- Frontend is still using seed content in code; it is wired to the API in Phase 4.
- Cart "totals" are display-only estimates; server `/cart/quote` is Phase 5. There is **no checkout/payment yet**; orders go through WhatsApp.

## Draft content needing owner review (do not treat as final)
- Benefits, how-to-use steps, FAQ answers, hero copy (EN + BN). Cautious wording, no medical/certification claims. Bangla wording should be proof-read by a native speaker.
- Ingredients: **not invented**; cards say "see label" until the owner supplies lists.
- Reviews: none shown (no real reviews yet).

## Known issues / limitations
- Logo is a photo extraction (low-res, slight roughness) — replace with original logo file if available.
- Packaging differs between studio photos (cream label/yellow cap) and lifestyle/box photos (green label/clear cap). Product cards use studio photos; hero/offer use the others.
- Bangla copy default language is an assumption (owner's offer text is Bangla).
- Fonts load from Google Fonts (self-host later for performance/privacy).
- Port 5000 is used by macOS AirPlay Receiver, so the API runs on **5001**.
- `bcryptjs` (pure JS) is used instead of native `bcrypt` (same algorithm; native build scripts are blocked in this environment). Slightly slower hashing; fine at our scale.
- Zod upgraded to v4 and React Router to v7 to clear `npm audit` advisories (0 vulnerabilities in production dependencies).
- `npm` reported blocked install scripts (esbuild/sharp); everything still builds and runs. Not an issue now.

## Testing Results (2026-11-11)
| Check | Result |
|---|---|
| `npm run typecheck` (client + server) | pass |
| `npm run lint` | pass |
| `npm test` — client 9 tests (pricing, cart store, WhatsApp message), server 2 tests | pass |
| `npm run build -w client` | pass; JS 115.6 kB gzip (budget 200 kB) |
| Browser smoke test (`node scripts/smoke-test.mjs`, Chrome, 390 px mobile emulation): drawer, combo total/free delivery, ৳610 / ৳670 delivery logic, persistence, language switch, FAQ, lightbox, no console errors | 13/13 pass |
| Overflow + console check at 360/390/768/1280 px (`scripts/screenshot.mjs`) | no horizontal overflow, no errors |
| **Server (Phase 3):** `npm test -w server` — 52 tests: models/constraints/transactions (18), auth + sessions + RBAC (21), HTTP security + rate limits (7), seed (4), app (2) | pass |
| Live run against local MongoDB (curl): admin login + cookie, superadmin route 200 / anonymous 401, refresh needs CSRF header (403 → 200), NoSQL-injection login rejected (400), generic invalid-credentials error, audit log written, seed ran twice with no duplicates | pass |
| `npm audit --omit=dev` | 0 vulnerabilities (after zod 4 / react-router 7 upgrade) |
| Client browser smoke test re-run after React Router 7 upgrade | 13/13 pass |
| **Phase 4 server tests** (`catalog.test.ts`, `cloudinary.test.ts`): totals now 82 server tests incl. concurrency, bundle stock, roles, validation, audit | pass |
| Phase 4 client: 16 unit tests (pricing from live prices, cart reconcile/clamp, image URLs, WhatsApp message) | pass |
| **Browser e2e vs real API + real MongoDB, throwaway DB** (`scripts/e2e-catalog.mjs`): 25 checks — empty-shop state, admin login/guard, set stock with reasons, refuse over-removal, publish, price/discount edit appears on storefront, bundle contents + computed value, free-delivery cart, combo goes Out of stock when a part sells out, create product, duplicate-SKU rejection, form validation, no console errors | 25/25 pass |
| `scripts/e2e-staff.mjs` — staff account sees Inventory only, redirected from Products, session survives reload | 6/6 pass |
| Bugs found by this testing and fixed: null discount rejected by money validator (blocked saving any product without a discount); featured flag not persisted; operator filters neutralised by `sanitizeFilter`; stale 45 s public cache; tall product photo overflowing card | fixed + regression tests |
| `npm audit --omit=dev` | 0 vulnerabilities |
| **Phase 5 server tests** (`checkout.test.ts`): 43 new tests — quote engine, tamper resistance, every coupon rule, COD order creation incl. bundles/gift, rollback on partial failure, idempotency (incl. 6 simultaneous identical requests), duplicate guard, order-status privacy, admin orders/coupons; **concurrency: 30 parallel buyers vs 10 in stock → exactly 10 orders; 12 combo orders vs 3 combs → exactly 3; coupon limit 4 vs 12 parallel → exactly 4**. Server total now 125 tests | pass |
| Phase 5 client: 28 unit/component tests (adds server-quote cart logic, catalogue store never un-mounts forms, coupon box cannot submit the checkout form, cart-sync notices, phone normalisation) | pass |
| **Browser e2e of a real purchase on a phone-sized screen** (`scripts/e2e-checkout.mjs`, real API + MongoDB, throwaway DB): cart totals from server, validation (EN + BN), invalid + valid coupon, order placed, confirmation private & reload-safe, stock/coupon counters updated, duplicate order held then confirmed, stock-changes-under-customer, out-of-stock blocks order, forged total rejected, admin finds order by phone and sees address + packing list, no console errors | all 31 checks pass |
| Regression: `e2e-catalog.mjs` (Phase 4) 25/25, `e2e-staff.mjs` 6/6 | pass |
| Bugs found by this testing and fixed: coupon box was a form nested inside the checkout form (tapping Apply submitted the whole checkout!); catalogue refresh replaced the checkout form with a spinner and wiped input; Mongoose treated a nested field named `type` as the field's type (any order with a coupon failed); partial coupon updates got a default value injected; `sanitizeFilter` neutralised the duplicate-window filter; stock-reduction notice vanished immediately | fixed + regression tests |
| Lighthouse / axe accessibility audit | **not yet run** |
| Real-device testing | **not done** |

### Phase 6 results — removed
The gateway tests/e2e from Phase 6 were deleted with the code (2026-11-11). Their stock-holding/expiry tests were rewritten for manual prepaid orders in `payments.test.ts`.

### Phase 7 results (2026-11-11)
- Typecheck/lint 0 errors; server **180 tests** pass (25 new in `orders.test.ts`), client **35 tests** pass (7 new). Tests cover: valid/invalid transitions, payment gate, staff vs admin permissions, racing admins, cancel (stock/coupon/sold count once, paid → refund flag, combos), returns (restock choice), tracking privacy + identical 404 + 5/min limit, cancel/return requests and decisions, return window, address/courier edits, escaped invoices and token-protected customer invoice, CSV formula guard, attention summary, notification queue/retry/give-up, reviews (verified-only, moderation, markup stripped, averages, permissions).
- Browser e2e `node scripts/e2e-orders.mjs` (phone + admin, real API/MongoDB): **33/33 checks pass** (order → WhatsApp confirm → courier → ship → track → cancel request → deliver → review → approve → return → invoice → CSV → Bangla; includes the 5/min lookup limit message). Earlier runs failed only on test-script mistakes (ambiguous locators, a reload race) and on the admin-login rate limit after many runs.
- **Not verified:** real email/SMS delivery (no provider), invoice printing on paper/other browsers, real devices, Lighthouse/accessibility.

### Manual payment system results (2026-11-11)
- Typecheck/lint clean; see the final counts in the Phase 7 report. New server tests (7): bank settings validation + rollback, details at checkout from the DB, claim never marks paid / blocks processing / admin verify + history with actor and timestamps, MFS sender number required, partial→full refund incl. two admins at once, COD vs prepaid filter, admin-only access. New client tests (3) for the bank/bKash panel.
- Browser e2e `node scripts/e2e-manual-payments.mjs` (phone + admin, no gateway): **35/35 checks pass** — checkout shows COD/bKash/bank with the owner's details and instructions; a submitted bank reference leaves the order Pending and unprocessable; admin Verify (with statement/TrxID reminder) marks it paid; history shows who/when/note; partial then full refund (customer sees it); COD vs prepaid filters; bKash reject → resubmit → verify; instructions/toggles edited in admin take effect at checkout; Bangla. Earlier attempts failed only on test-script timing/locator mistakes.
- Final totals: server **187** tests, client **38** tests, typecheck/lint 0 errors, `npm audit --omit=dev` 0 vulnerabilities.

### Phase 8 results (2026-11-11)
- `npm run typecheck`, `npm run lint`: 0 errors. Server **183** tests (17 new in `admin.test.ts`: revenue definition, new/returning, Dhaka-day chart, best sellers/low stock/validation, customers + block + export + regex-safe search, contact honeypot/rate limit/inbox, settings validation + live delivery fee change, announcement expiry/FAQ, audit log, filters/exports, role checks), client **43** tests. `npm audit --omit=dev`: 0 vulnerabilities.
- Browser e2e `node scripts/e2e-admin.mjs` (owner + staff + phone, real API/MongoDB): **45/45 checks pass**. Several early attempts failed only on test-script issues (uppercase labels, ambiguous locators, badge text in menu links). One real bug was found by the server tests: two queries used `$ne` without `mongoose.trusted()` (the documented sanitizeFilter gotcha) — fixed.
- Regression after the gateway removal and the new admin shell: `e2e-orders.mjs` all checks pass; `e2e-manual-payments.mjs` 35/35 pass (one expectation updated for the renamed `verified` history event).
- **Not verified:** real phones, Lighthouse/accessibility, printing, Cloudinary upload.

### Phase 9 results (2026-11-11)
- Typecheck/lint 0 errors. Server **191** tests (8 new in `seo.test.ts`), client **66** tests (23 new: safe Markdown, structured data, consent/tracking behaviour incl. queueing and withdrawal, cookie banner). `npm audit --omit=dev`: 0 vulnerabilities.
- Browser e2e `node scripts/e2e-seo.mjs` (Google/Meta requests intercepted): **46/46** — before consent no request to Google/Meta, no dataLayer/fbq; Reject all keeps it off after reload; analytics-only loads Google only; Accept all loads both; events carry no personal data; withdrawing consent stops events; pending orders are not purchases, confirmed ones report one purchase and never twice; meta/OG/canonical/JSON-LD/robots/sitemap correct; legal pages (draft notice, live fees, owner text, script/javascript: inertness); admin SEO/legal editors and validation messages.
- Bugs found by testing and fixed: Google events fired before the shim loaded were lost (now queued, discarded if consent is withdrawn); static and app meta tags duplicated (now replaced via `data-rh`); admin showed a generic "invalid data" message instead of the specific reason.
- **Lighthouse** (mobile, simulated slow 4G, built site, landing page, 2026-11-11): **SEO 100, Accessibility 100, Best Practices 100, Performance 77** (FCP 1.7 s, CLS 0.001, TBT 120 ms, LCP 6.0 s). Before fixes it was SEO 100 / Accessibility 93 / Performance 68. Fixed: gold text on the dark green (new `gold-soft` token, 5.2:1), closed cart drawer no longer focusable (`inert`), logo accessible name, render-blocking web fonts (now loaded after first paint), oversized images (480/800 px WebP srcset) and a 57 KB logo (now 5 KB). **Not met yet (Phase 10): LCP < 2.5 s.** Cause: the page shows a splash until the shop data arrives, then React renders the hero — the image itself loads in ~25 ms, but 68 % of LCP is "render delay" (JS bundle 141 KB gzip executing on a throttled CPU + waiting for data). Proposed fix: render the page shell/hero immediately with skeletons and lazy-load below-the-fold sections.

### Phase 10 results (2026-11-11)
- Typecheck/lint 0 errors. **Client 81 tests, server 220 tests pass** (hardening 29, seo 8, admin 17, orders 25, payments 16, checkout 43 …).
- Full browser + load run: **all 12 steps passed in one clean run** (details in `TESTING.md` → "Full browser run"). Early runs failed on test-script/runner mistakes (page reloads tripping the refresh rate limit, killing the wrapper instead of the API so rate-limit state leaked between scripts, a Playwright `evaluate` that bypasses CSP) and one real finding (Zod needing eval under CSP) — all fixed.
- Lighthouse (landing, mobile): SEO 100, Accessibility 100, Best Practices 100, Performance 77.

## Deployment Status
Not deployed. No production services configured.

## Open Questions (owner)
See PROJECT_SPECIFICATION.md §22. Still needed: ingredient lists, business email/address, original logo file, whether the "100% organic" claim and the label model photo may be used, current packaging version, whether comb can be sold alone, combo end date/limit.

## Decisions Log
- 2026-11-11 (owner request): delivery zones are now **Inside Rangpur ৳60 / Outside Rangpur ৳120** (replacing Dhaka; zone keys `inside_rangpur`/`outside_rangpur`; the live dev database was updated, owner can still edit in Admin → Website). Combo ৳999 with free delivery all over Bangladesh (unchanged). Landing page gained an **order section** (`#order`): pick products, then fill the same checkout form on the page and place the order (COD / manual payments), with server-side pricing. The form was extracted to `components/shop/CheckoutForm.tsx` and is shared with `/checkout`. Test: `scripts/e2e-inline-order.mjs`.
- 2026-11-11 (Phase 10): website CSP forbids inline script and eval (styles allow inline because React sets style attributes); Zod JIT disabled app-wide; access/error logs scrub phones, emails, tokens and JWTs; every API response is `no-store` unless a route sets its own short cache; production boot refuses unsafe config; test runner uses its own API port; vitest pinned to `src/**/*.test.*` (v4 no longer ignores `dist`) and tests are excluded from the production server build; `sharp`/`vitest` upgraded for audit; residual moderate `minimatch` (dev-only) accepted.
- 2026-11-11 (Phase 9): no prerender dependency (baseline static tags + client-side meta/JSON-LD; revisit at deployment); policies are drafts until the owner confirms; policies shown in English only; cookie banner appears only when tracking IDs exist; `purchase` = customer views an accepted order (WhatsApp-confirmation workflow) — server-side Conversions API deferred (needs token/approval); gtag shim is a separate same-origin file (lint forbids `arguments`; also CSP-friendly).
- 2026-11-11 (Phase 8): "Revenue" = confirmed-or-later orders (not pending/cancelled/returned), by Bangladesh day; customers keyed by phone (guests included); block flag also disables a registered account; only notes/blocks are stored separately; hero/benefits/how-to/ingredient/trust/gallery/offer copy stays in code for now (owner to say if needed); legal pages and SEO moved to Phase 9; no chart library (SVG) and no new dependencies.
- 2026-11-11: **SSLCOMMERZ deleted entirely** (owner request): payments are COD + manual bKash/Nagad/Rocket + manual bank transfer only; `needs_review` payment status, gateway env vars and the `/payments/sslcommerz/*` routes no longer exist; verifying a claim is one transaction (order + payment together, or neither).
- 2026-11-11 (Phase 7): invoice = server-rendered HTML page (print/save as PDF) rather than a PDF file (Bangla text, no new dependency); owner alerts = menu badge + WhatsApp click-to-chat (automatic WhatsApp is paid); return requests are whole-order and disabled until the owner sets a return window; reviews require a delivered order (no anonymous reviews); forgot/reset password deferred until an email/SMS provider is chosen; customer cancel/return are *requests* the owner approves.
- 2026-11-11 (Phase 6): stock is deducted at order creation and restored by the expiry job (instead of `reservedStock`); fail/cancel keep the order payable until expiry (30 min online); IPN `verify_sign` not used (docs do not define it) — Order Validation API is authoritative; payments arriving after cancellation/duplicates → `needs_review`; `SSLCOMMERZ_BASE_URL` dev-only override for the stand-in gateway; gateway-required but uncollected fields use fixed placeholders (postcode 1000, `<orderNo>@customers.invalid` email); `enabledChannels` setting is not used to restrict gateway channels (docs say do not use `multi_card_name`).
- 2026-11-11: owner: orders are accepted via WhatsApp.
- 2026-11-11: Checkout is guest-first; only Cash on Delivery until Phase 6. Order summary is shown after the form on phones (sticky bar carries the total + Place order button). Checkout draft is kept in sessionStorage (cleared after ordering) rather than localStorage, to avoid leaving personal data on shared devices.
- 2026-11-11: Descriptions are plain text; stock only via inventory endpoint; public catalogue cached 10 s; combo is the featured offer; storefront shows an honest empty state (never fake products) until products are published.
- 2026-11-11: API port 5001 (macOS reserves 5000). Staff/audit endpoints are superadmin-only. Seeded products are drafts with stock 0 until the owner supplies real stock.
- 2026-11-10: Launch catalogue = combo ৳999 + oil ৳550 (200 ml) + powder ৳500 (225 g, "Hair Powder") + comb ৳150. Delivery ৳60 Dhaka / ৳120 outside, free only with combo.
- 2026-11-11: Stack versions: React 18, Vite 6, Tailwind 3.4, Zustand for cart, Vitest 3.
- 2026-11-11: Interim ordering via WhatsApp until Phase 5/6 checkout.
