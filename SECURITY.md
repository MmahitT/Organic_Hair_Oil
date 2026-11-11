# Security Policy

This project is an online store (customers, orders, phone numbers, addresses). Treat it accordingly.
The detailed checklist with evidence is in [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md); how to run the checks is in [`TESTING.md`](TESTING.md).

## Reporting a vulnerability

Please **do not open a public GitHub issue** for security problems.
Use GitHub's private "Report a vulnerability" feature on this repository (Security tab → Advisories), or contact the owner directly. Include what you found, how to reproduce it, and the impact. We aim to reply within 7 days.

## Security practices in this project

- **Payments:** there is no payment gateway. bKash and bank transfers are paid by the customer outside the site; a customer's transaction ID is only a *claim*. An order becomes paid **only** when an admin verifies it against the real bKash/bank record. Refunds are records, the system never moves money. No card data, PINs or passwords are collected.
- **Server is the authority:** prices, delivery fees, discounts, stock and payment status are always recomputed on the server from the database.
- **Passwords:** bcrypt (cost ≥ 12). **Tokens:** short-lived access token + rotated refresh token in an `HttpOnly`, `Secure` cookie.
- **Access control:** deny-by-default role checks (superadmin / admin / staff) on every admin route, covered by an automated route-by-route test.
- **Input:** every request is validated with Zod; unknown fields are dropped; NoSQL-injection sanitising is on.
- **Browser:** Content-Security-Policy (no inline script, no eval), Helmet headers, strict CORS allow-list, rate limits on login, tracking, coupons, reviews, contact and checkout.
- **Privacy:** logs scrub phone numbers, e-mails, tokens; API responses with personal data are `no-store`; analytics/pixels run only after cookie consent.
- **Audit:** sensitive admin actions are written to an activity log.

## Environment variables and secrets

Real values live **only** in untracked files on the machine/host that needs them:

| File | Purpose | In Git? |
|---|---|---|
| `server/.env` (or root `.env`) | server secrets (database URI, JWT secrets, Cloudinary, first admin) | **No — ignored** |
| `client/.env*` | public build settings only (`VITE_*`) | **No — ignored** |
| `.env.example`, `server/.env.example`, `client/.env.example` | placeholders documenting each variable | Yes (placeholders only) |

Rules:

1. Never put a secret in a `VITE_*` variable — everything with that prefix is published inside the website.
2. Generate secrets with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Use **different** values for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`, and different from development.
3. In production the server refuses to start with placeholder/identical JWT secrets, a bcrypt cost below 12, insecure cookies, or non-HTTPS origins.
4. Put production secrets in your host's secret manager / environment settings, not in files in the repository.
5. The owner's bKash/bank details and payment instructions are stored in the database (Admin → Payments), never in code.
6. **If a secret is ever committed or pasted somewhere public: treat it as compromised.** Rotate it first (new database password, new JWT secrets, new Cloudinary key), then clean the history. Deleting the file in a later commit does **not** remove it from Git history.

Before every release run `node scripts/scan-secrets.mjs` (scans the repository and the built website for the real values in `server/.env`).

## Authentication and authorization notes

- Admin sign-in is rate limited (8 attempts / 15 minutes per client, plus per-account lockout). Change the seeded owner password after the first sign-in and use a long, unique password.
- Staff accounts see only what their role allows; team management and the activity log are superadmin-only.
- Customers do not have accounts. Order pages and tracking require the order number **and** the phone number or a private link token, and failures look identical (no order enumeration).
- The in-memory rate limiter is per server instance. If you run more than one API instance, switch to a shared store (e.g. Redis) first.

## Pre-deployment checklist

- [ ] `npm audit --omit=dev` shows no vulnerabilities; review `npm audit` for the rest.
- [ ] `npm run typecheck && npm run lint && npm test` pass; `sh scripts/run-all-e2e.sh` passes.
- [ ] `node scripts/scan-secrets.mjs` is clean.
- [ ] Production `.env` set from `server/.env.example` with new random secrets; `NODE_ENV=production`; `COOKIE_SECURE=true`; real HTTPS `FRONTEND_URL`, `BACKEND_URL`, `CORS_ORIGINS`; `TRUST_PROXY` set correctly for your host.
- [ ] The site and API are served over HTTPS (HSTS on) and the host sends the headers from `client/dist/_headers`.
- [ ] MongoDB Atlas: dedicated database user with least privilege, network access restricted, backups on.
- [ ] Default/seed owner password changed; unused admin accounts removed.
- [ ] Owner has reviewed the four policy pages and replaced placeholder business details in Admin → Website.
- [ ] Real stock set; temporary development stock removed.
- [ ] Repository is private or contains no real data; GitHub secret scanning and Dependabot alerts enabled.
- [ ] A professional penetration test and legal review are completed before taking real orders at scale.
