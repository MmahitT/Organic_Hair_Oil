# Deploying to Vercel — two projects from one repository

The repository holds two independent apps. Each is its own Vercel project with its own settings and variables:

| Project | Root Directory | Config | What it is |
|---|---|---|---|
| **API** (create first) | `server` | `server/vercel.json`, `server/api/index.mjs` | Express REST API as one serverless function, plus the daily jobs cron |
| **Website** | `client` | `client/vercel.json` | React/Vite static site |

**How they connect:** the website project forwards every `/api/*` request to the API project (a rewrite in `client/vercel.json`). The browser only ever sees the website's address, so login cookies stay first-party and no cross-site CORS or cookie changes are needed.

## 1. MongoDB Atlas (free tier is enough to start)
Create a cluster, a **database user with a strong password** (least privilege: read/write on one database), and allow network access (Vercel uses changing IPs, so Atlas "0.0.0.0/0" is needed — rely on the strong password and TLS). Copy the connection string (`mongodb+srv://…`). Atlas is a replica set, which the order transactions require.

## 2. API project (Vercel → Add New → Project → this repo → Root Directory `server`)
Framework Preset: **Other**. Leave Build/Install/Output at their defaults (they come from `server/vercel.json`). Also keep "Include source files outside of the Root Directory" **on** (default).

Environment variables (Production). Never commit these. Generate secrets with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` (a different one for each).

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | the Atlas connection string |
| `MONGODB_DB_NAME` | `beauty_organic` |
| `JWT_ACCESS_SECRET` | random, 48+ chars |
| `JWT_REFRESH_SECRET` | a *different* random value |
| `FRONTEND_URL` | the **website** address, `https://<website-domain>` |
| `BACKEND_URL` | the website address too (browsers reach the API through it) |
| `CORS_ORIGINS` | `https://<website-domain>` only |
| `COOKIE_SECURE` | `true` |
| `TRUST_PROXY` | `true` |
| `CRON_SECRET` | random; Vercel Cron sends it as a Bearer token |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | only to create the first owner (12+ chars); remove afterwards |
| `CLOUDINARY_*` | optional, when you have an account |

Deploy it, then note its address (for example `https://hair-oil-api.vercel.app`). Check `https://<api-address>/api/v1/health` returns JSON.

## 3. Website project (Add New → Project → same repo → Root Directory `client`)
Framework Preset: **Vite**. Before deploying, edit `client/vercel.json`: replace `REPLACE-WITH-API-PROJECT.vercel.app` in the first rewrite with the API address from step 2 (host only), commit and push.

Environment variables (Production, public values only): `VITE_SITE_URL` = `https://<website-domain>`; optional analytics IDs. **Do not** set `VITE_API_BASE_URL` (the site calls `/api/v1`, which the rewrite forwards). Never put a secret in a `VITE_*` variable.

## 4. First data (run once from your computer, never from Vercel)
Put the Atlas values in a **temporary** shell environment (not a file in the repo), then:
`npm run seed -w server -- --allow-production` creates the products, delivery zones and the owner account. Then sign in at `/admin`, change the password, set real stock (Admin → Inventory), prices, payments and contact details.

## 5. Check it
- `https://<website-domain>/api/v1/health`, `/api/v1/products`, `/api/v1/delivery/zones` return JSON (proves the forward works).
- `node scripts/smoke-production.mjs https://<website-domain>`.
- The home page lists the products; a test order can be placed; it appears in Admin → Orders; admin sign-in survives a page refresh.
- If Vercel "Deployment Protection" is on, visitors must sign in to Vercel — turn it off for Production on **both** projects.

## Known limits on Vercel
- Rate limits are counted per function instance (in memory), so they are weaker than on a single server. Move them to a shared store before heavy traffic. Because requests arrive through the website's forward, check the client IP the API sees (`TRUST_PROXY=true`) after deploy.
- The payment-expiry/notification jobs run from a **daily** Vercel Cron on the API project (free plan: once a day); unpaid prepaid orders release their stock at the next run.
- A cold start adds about a second to the first request.
- Your own domain with an `api.` subdomain is possible later but then cookies need cross-subdomain settings; keep the forward unless you decide to change.

## Local development and tests
Unchanged: `npm run dev` from the repo root starts both; the website proxies `/api` to the API on port 5001. The root `vercel.json`, `api/` and `scripts/copy-dist.mjs` belong to the old one-project setup and are kept only until the owner approves removing them.
