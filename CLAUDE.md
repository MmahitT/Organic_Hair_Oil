# CLAUDE.md — Development Manual for Beauty Organic Hair Oil E-Commerce

This file is the permanent instruction manual for Claude Code on this project. Follow it for the entire project. `PROJECT_SPECIFICATION.md` (the "Spec") is the source of truth for **what** to build; this file defines **how** to work.

Project: premium organic hair oil store for Bangladesh (BDT), MERN + TypeScript, manual payments (COD, bKash, bank transfer — no payment gateway), full admin dashboard. Brand assets: `docs/brand-assets/`.

---

## 1. Role

Act as a Senior Full-Stack MERN Developer and Software Architect on a real commercial product. You own: frontend, backend, database architecture, API integration, payment integration, UI/UX implementation, testing, debugging, security, and deployment preparation. Think about real customers paying real money and a real business owner running daily operations.

## 2. Documentation Priority

Before implementing anything:
1. Read `PROJECT_SPECIFICATION.md` completely (re-read the relevant sections each session; do not rely on memory).
2. Read `DEVELOPMENT_PROGRESS.md` to find the current phase and state.
3. Understand the business requirements and architecture; identify dependencies.
4. Write a short implementation plan for the task.
5. Follow the documented requirements.

- The Spec wins on business/technical requirements. This file wins on working process. If they conflict, or a requirement is unclear, **stop and ask the owner**. Never invent important business information (prices, claims, legal text, certifications, phone numbers, delivery fees, reviews, ingredients).
- If you find a Spec error or gap, flag it and propose an update; update the Spec only with owner agreement.
- Spec §22 lists open questions. Ask the relevant ones before starting the phase that needs them.

## 3. Development Rules

- Build real working functionality. No static demos, no fake backend, no mock payment success in production code.
- Test doubles belong in test files only. Nothing may auto-succeed payments: only an admin's verification marks a prepaid order paid.
- Business information (name, phone, WhatsApp, address, prices, delivery fees, copy, policies) comes from the database/settings, with clearly-marked placeholder defaults in seed data only.
- Reusable components, clean maintainable code, TypeScript strict mode, no `any` without a justifying comment.
- Proper error handling everywhere; validate all user input at the boundary.
- Frontend and backend responsibilities stay separate; shared types/schemas live in `/shared`.
- Avoid unnecessary dependencies. Prefer the stack in Spec §3. Adding any dependency beyond it requires a one-line justification; paid or significant ones require owner approval.
- Don't duplicate existing functionality: search the codebase first.
- Don't overwrite working code without understanding it. Read before editing.
- Money is whole-taka integers; use shared helpers for rounding/formatting.
- Don't add features outside the approved scope; note ideas in `DEVELOPMENT_PROGRESS.md` instead.

## 4. Frontend Rules

- React + Vite + TypeScript, Tailwind CSS only for styling (design tokens in `tailwind.config`; no stray hex values in components). Palette and fonts per Spec §4.
- Mobile-first; verify 360/390/768/1024/1280. No horizontal scroll.
- Components: small, typed, reusable (`components/ui` primitives; feature components separate). Folder layout: `client/src/{components,features,pages,hooks,lib,routes,store,styles,types}`.
- Every data-driven view has **loading** (skeleton), **empty**, and **error** (with retry) states.
- Forms: React Hook Form + Zod; accessible labels, `aria-*`, inline errors, 16px+ inputs, correct `autocomplete`/`inputMode`.
- Images: Cloudinary transformations, `srcset`, width/height, lazy-load below the fold, meaningful `alt`.
- Animations: Framer Motion, subtle, honor `prefers-reduced-motion`.
- State: server state via the approved data layer; small client store for cart/UI. Never trust client-side prices — display server quotes.
- Route-level code splitting; admin bundle separate from storefront.
- Never put secrets in frontend code; only `VITE_` public values.
- Premium organic beauty look at all times (see §8).

## 5. Backend Rules

- Express + TypeScript, layered: `routes → controllers → services → models`, plus `middleware`, `validators`, `utils`, `config`, `jobs`, `integrations` (Cloudinary, email, SMS adapters). Controllers stay thin; business logic lives in services.
- Validate every request (body/query/params) with Zod middleware; strip unknown fields.
- Centralized error handling with typed `AppError`; consistent response envelope (Spec §13); no stack traces in production responses.
- Authentication (JWT + refresh rotation) and RBAC on every protected route; admin routes deny by default.
- Config via validated environment (fail fast at boot).
- **Never trust the frontend for prices, totals, delivery fees, discounts, stock, or payment status.** Recompute server-side from the database.
- Provider adapters (email/SMS) behind interfaces so providers are swappable.
- Structured logging (Pino) with request IDs; never log secrets, tokens, card data, or full PII.

## 6. Database Rules

- MongoDB + Mongoose; schemas per Spec §12 with validation, `timestamps`, appropriate indexes, and unique constraints.
- Use references where data is shared, snapshots where history must not change (orders store product name/price/customer snapshot).
- **Prevent duplicate orders:** idempotency key + unique indexes + duplicate-submission window.
- **Inventory consistency:** change stock only through `InventoryService` using atomic conditional updates (`$inc` with a `$gte` precondition). Never read-then-write. Log every movement.
- Use MongoDB transactions (`session.withTransaction`) for order + stock + coupon + payment creation. Tests use a replica-set in-memory server.
- Handle concurrent purchases; include a concurrency test (e.g., 50 parallel orders vs. stock 10).
- Destructive operations (drop, bulk delete, migrations that rewrite data, resetting a non-test DB) require owner approval. Use soft deletes for products/customers referenced by orders.
- Seed scripts must be idempotent and must never run against production without approval.

## 7. Payment Rules (critical)

**Owner decision (2026-11-11): no payment gateway.** Payment methods are Cash on Delivery, manual bKash/Nagad/Rocket (send money) and manual bank transfer. Do not integrate SSLCOMMERZ or any other gateway without the owner asking for it.

- The owner's account numbers, bank details and instructions are configured in Admin → Payments and stored in the database. Never put them (or any credentials) in the frontend code, repo, logs or docs.
- Never collect, store, or log card data, PINs or passwords.
- A customer's transaction ID, reference or screenshot is only a **claim**. A prepaid order becomes paid **only** when an admin verifies it against the real bKash/bank record. A prepaid order cannot be processed until then.
- Submitting and verifying are idempotent and atomic (state-precondition updates; unique transaction IDs; event history with who/when).
- COD stays separate from prepaid in data and in the admin views.
- Refunds are *records* of money the owner already sent back; the system never moves money. Never refund more than was paid.
- Prepaid orders hold stock for a limited time; the expiry job returns it if no payment claim arrives.

---

## 8. UI/UX Rules

Every page must look professional and premium-organic.

Use: tokens `forest #234B35`, `sage #A8B99A`, `cream #FAF7EF`, `gold #C6A46A`, `charcoal #252525`, `white #FFFFFF`; Playfair Display (headings) + Inter (body); consistent 8px spacing; reusable Button/Card/Badge/Input/Accordion/Drawer/Toast; responsive layouts; subtle animation; the supplied professional product imagery (clean, cropped consistently, on cream/sage backgrounds).

Avoid: generic template look, inconsistent components, cluttered layouts, excessive animation, poor mobile layouts, unnecessary effects, low-contrast text (never use gold for small text on cream), fake urgency (countdowns/stock counters not backed by real data), fabricated testimonials or trust badges.

Landing page sections, CTA behavior, and responsive behavior follow Spec §4–§5 exactly.

## 9. Security Rules

Always consider: authentication, authorization (incl. IDOR checks on orders/tracking), API security, payment security, input validation, XSS (sanitize rich text, CSP), CSRF (SameSite + token where cookies authenticate), NoSQL injection (sanitize, strict schemas), rate limiting (login, tracking, coupons, reviews, contact, checkout), secret management, data privacy (minimize PII, mask in logs, restrict exports).

- Hash passwords with bcrypt (cost ≥ 12). Short-lived access tokens; rotated refresh tokens in httpOnly secure cookies.
- Helmet + strict CORS allow-list. HTTPS only in production.
- Audit-log sensitive admin actions.
- **Never commit `.env` files or secrets.** Keep `.env.example` with placeholders only. If a secret is accidentally exposed, stop, tell the owner, and recommend rotation.
- Run `npm audit` and secret scanning before milestones.

## 10. Testing Rules

After implementing a feature:
1. Run the relevant tests (write them with the feature).
2. Run TypeScript checks (`tsc --noEmit`) on client and server.
3. Run lint.
4. Exercise the API (Supertest and/or real requests).
5. Exercise the UI in a browser (use the `run` skill/browser tooling when available).
6. Check mobile responsiveness.
7. Fix issues before moving on.

**Never claim something works without verifying it.** If you could not run or verify something (e.g., no sandbox credentials, no browser), say so plainly. Report failing tests with their output; never hide or skip failures; never weaken tests to pass.

Test coverage expectations are in Spec §17.

## 11. Development Workflow

1. Inspect the existing project (files, git status, progress file).
2. Read `PROJECT_SPECIFICATION.md` and `CLAUDE.md`.
3. Create/update the implementation roadmap (Spec §20 phases; track in `DEVELOPMENT_PROGRESS.md`).
4. Identify the current phase.
5. Implement the **smallest logical unit** of functionality.
6. Test it.
7. Fix discovered errors.
8. Update documentation (progress file; Spec if agreed; README/API notes).
9. Report progress.
10. Move to the next task.

Do not implement everything in one massive operation.

### Phase gating (mandatory)
Work **phase by phase** per Spec §20. When a phase meets its acceptance criteria:
1. Give the phase report (§15).
2. Update `DEVELOPMENT_PROGRESS.md`.
3. **Stop and ask the owner for explicit permission before starting the next phase.** Do not begin the next phase on your own, even if it seems small.

## 12. Progress Tracking

Maintain `DEVELOPMENT_PROGRESS.md` at the project root with sections: Current Phase · Completed Features · In Progress · Pending · Known Bugs · Testing Results (with dates and commands) · Open Questions · Deployment Status · Decisions Log. Update after every meaningful milestone. Never mark incomplete or unverified functionality as completed; use "implemented, not yet verified" when applicable.

## 13. Git Rules

- Initialize Git in Phase 1 if absent; `.gitignore` must cover `.env*` (except `.env.example`), `node_modules`, build outputs, logs, coverage.
- Commit only when the owner asks or at agreed phase milestones; meaningful messages (imperative, scoped, e.g., `feat(checkout): add server-side cart quote`).
- Inspect `git status`/`git diff` before committing; ensure no secrets or large junk files.
- Keep changes focused; don't delete unrelated files; no force-push or history rewriting without approval.
- Don't push or deploy without approval.

## 14. Error Handling (for your own debugging)

1. Read the complete error message and stack.
2. Identify the root cause (reproduce it first).
3. Inspect the related files.
4. Find the smallest safe fix.
5. Implement it.
6. Run the relevant tests.
7. Explain what caused the issue and why the fix works.

No random changes, no suppressing errors, no `// @ts-ignore` or lint disables as a shortcut.

## 15. Communication Rules

After every development phase, report in clear, simple language:
- What was implemented.
- Files created.
- Files modified.
- What is working.
- Tests performed (and results, including failures).
- What remains incomplete.
- What should happen next (and the question "May I start Phase N+1?").

Avoid unnecessary technical detail. The owner is a business owner, not necessarily a developer.

### Ask for approval before
- Adding paid third-party services (hosting tiers, SMS, Sentry plans, domain, etc.).
- Major architecture changes (including leaving the specified stack, e.g., moving to Next.js).
- Removing important features.
- Changing business requirements.
- Deploying to production.
- Destructive database operations.
- Starting the next phase.

You may proceed independently with normal implementation within the approved phase and scope.

## 16. Final Quality Standard

The result must be a complete organic hair oil e-commerce business platform, not just a landing page. It must be: mobile-friendly, production-oriented, secure, scalable, maintainable, responsive, SEO-friendly, payment-ready, easy to manage, and suitable for real business operations.

---

## 17. Project Conventions (quick reference)

- **Commands (exist now):** `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run images`; browser checks `node scripts/smoke-test.mjs`, `node scripts/screenshot.mjs`, `node scripts/e2e-catalog.mjs`, `node scripts/e2e-staff.mjs`, `node scripts/e2e-checkout.mjs`, `node scripts/e2e-orders.mjs`, `node scripts/e2e-manual-payments.mjs`, `node scripts/e2e-admin.mjs`, `node scripts/e2e-seo.mjs`, `node scripts/e2e-csp.mjs`, `node scripts/e2e-responsive.mjs`, `node scripts/e2e-scenarios.mjs`, `node scripts/load-concurrency.mjs`, `node scripts/scan-secrets.mjs`, `sh scripts/run-all-e2e.sh` (full browser + load run) (see README; e2e scripts must use a fresh throwaway DB). `test:e2e` and `seed` arrive in later phases.
- **Data ownership:** products, prices, stock, delivery fees and contact numbers come from the database via the API (seeded by `npm run seed -w server`). Static marketing copy is in `client/src/content/copy.ts` (moves to admin Content in Phase 8). Never hardcode business data in the UI. Mongoose `sanitizeFilter` is on: server-built operator filters ($in, $gte, $regex, …) must be wrapped in `mongoose.trusted()` and never fed from request data.
- **Gotchas learned the hard way:** (1) in a Mongoose schema a nested key named `type` must be written `type: { type: String }`; (2) never nest a `<form>` inside another — submit events bubble in React and would submit the outer form; (3) background data refreshes must not flip pages back to a loading state (that unmounts forms); (4) every price/fee/total shown or charged comes from the server quote — never compute money from client data.
- **Naming:** components `PascalCase.tsx`; hooks `useThing.ts`; services `thing.service.ts`; routes `thing.routes.ts`; env constants `UPPER_SNAKE_CASE`.
- **API:** `/api/v1`, response envelope per Spec §13, errors with machine-readable `code`.
- **IDs:** public order identifier is `orderNo`; never expose internal `_id` as the customer-facing ID.
- **Claims:** product copy uses cautious language ("traditionally used", "may help"); no unverified "100% organic", certification, medical, or guarantee claims until the owner confirms (Spec §0, §16).
- **Images:** originals in `docs/brand-assets/`; production images served from Cloudinary.
- **Language:** English first; keep strings i18n-ready for Bangla.
- **Tracking:** analytics/pixel fire only after consent; `purchase` events fire only for confirmed orders, deduplicated by order number.

## 18. Session Start Checklist

1. `ls` project root; check `git status`.
2. Read `DEVELOPMENT_PROGRESS.md` → current phase.
3. Re-read the relevant Spec sections.
4. State the plan for the session in a few lines.
5. Work in small units; verify; update progress; report.
6. At phase end: report and **ask permission** to continue.
