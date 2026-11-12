# Deploying to Vercel — one project

The single Vercel project serves both the React storefront and the Express API on the same origin. The repository root is the Vercel Root Directory (`.`); root `vercel.json` builds the workspaces, publishes `dist/`, routes `/api/*` to the serverless handler, applies security headers, and schedules the daily jobs. The local repository root is linked to Vercel project `beauty-organic-store`; Git-based automatic deploys are not configured by that local link.

## 1. Set up MongoDB Atlas

Create an Atlas replica-set cluster and a database user with a strong password and read/write access only to the application database. Vercel Hobby functions use changing outbound IPs, so Atlas may require `0.0.0.0/0`; use a unique strong database password and TLS. Free M0 does not include backups; review `RUNBOOK.md` before storing live orders.

## 2. Configure the Vercel project

In Vercel → `beauty-organic-store` → Settings → Environment Variables, add the following to **Production**. Do not put secret values in the repository or in any `VITE_*` variable. Generate different JWT values with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and enter them directly in Vercel.

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Atlas connection string (`mongodb+srv://...`) |
| `MONGODB_DB_NAME` | `beauty_organic` |
| `JWT_ACCESS_SECRET` | Random value, at least 32 characters |
| `JWT_REFRESH_SECRET` | A different random value, at least 32 characters |
| `FRONTEND_URL` | The assigned HTTPS site origin |
| `BACKEND_URL` | The same site origin |
| `CORS_ORIGINS` | The same site origin only |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAMESITE` | `lax` |
| `TRUST_PROXY` | `true` |
| `BCRYPT_SALT_ROUNDS` | `12` |
| `CRON_SECRET` | A separate random secret; Vercel Cron sends it as a Bearer token |
| `VITE_SITE_URL` | The site origin; used at build time for canonical URLs and sitemap |

Optional: `VITE_GA4_MEASUREMENT_ID` and `VITE_META_PIXEL_ID` are public analytics IDs and only enable tracking after consent. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` only when Cloudinary is configured. Do not add `SEED_ADMIN_*` to Vercel; provide those only to the one-time local seed command.

Set the project Root Directory to `.`, Framework Preset to **Other**, and leave the commands controlled by root `vercel.json` (`npm install --include=dev`, `npm run build`, output `dist`). The project must include files from the repository root; do not set the Root Directory to `client` or `server`.

After Atlas and all required Production variables are configured, deploy from the repository root:

```sh
npx vercel deploy --prod
```

Use the production domain assigned by Vercel consistently for `FRONTEND_URL`, `BACKEND_URL`, `CORS_ORIGINS`, and `VITE_SITE_URL`. If changing it later, update those values and redeploy.

## 3. Seed and configure the store

Run the idempotent seed once from a local terminal pointed at the production Atlas database. Make the full required Production configuration above available to the local seed process, plus `SEED_ADMIN_EMAIL` and a strong `SEED_ADMIN_PASSWORD` (12+ characters). Keep these temporary and out of committed files; do not put production secrets in `.env.local` for this step. Then run:

```sh
npm run seed -w server -- --allow-production
```

Remove the temporary seed credentials, sign in at `/admin`, change the owner password, enter real stock, publish products, and configure payment details, contact information, and policies. Seeded products are drafts with zero stock until the owner updates them.

## 4. Verify

- `https://<site-domain>/api/v1/health` reports the database as up.
- `node scripts/smoke-production.mjs https://<site-domain>` passes. This smoke test is read-only and does not place an order.
- Confirm the storefront, admin login, and API routes on the assigned production domain.
- Disable Vercel Deployment Protection for Production if public visitors are asked to sign in to Vercel.

## Known limits

- Rate limits are in memory per serverless function instance, not shared across instances. Move them to a shared store before significant traffic.
- The payment-expiry and notification jobs run from a daily Vercel Cron on Hobby; expired prepaid stock may remain held until that run.
- Cold starts add latency to the first API request.
- `TRUST_PROXY=true` is required behind Vercel. Review production logs and rate-limit behavior after launch.

## Local development

`npm run dev` from the repository root starts both workspaces; the Vite development server proxies `/api` to the API on port 5001.
