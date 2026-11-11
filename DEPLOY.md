# Deploying to Vercel (website + API in one project)

`vercel.json` serves the website from `client/dist` and runs the Express API as one serverless function (`api/index.mjs` → `server/dist/serverless.js`) on the **same domain**, so cookies work and no CORS setup is needed between site and API.

## 1. MongoDB Atlas (free tier is enough to start)
Create a cluster, a **database user with a strong password** (least privilege: read/write on one database), and allow network access (Vercel uses changing IPs, so Atlas "0.0.0.0/0" is needed — rely on the strong password and TLS). Copy the connection string (`mongodb+srv://…`). Atlas is a replica set, which the order transactions require.

## 2. Environment variables (Vercel → Project → Settings → Environment Variables, Production)
Never commit these. Generate secrets with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` (use a different one for each).

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | the Atlas connection string |
| `MONGODB_DB_NAME` | `beauty_organic` |
| `JWT_ACCESS_SECRET` | random, 48+ chars |
| `JWT_REFRESH_SECRET` | a *different* random value |
| `FRONTEND_URL` | `https://<your-domain>` |
| `BACKEND_URL` | `https://<your-domain>` |
| `CORS_ORIGINS` | `https://<your-domain>` |
| `COOKIE_SECURE` | `true` |
| `TRUST_PROXY` | `true` |
| `CRON_SECRET` | random; Vercel Cron sends it as a Bearer token |
| `VITE_SITE_URL` | `https://<your-domain>` (canonical links / sitemap, used at build time) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | only to create the first owner (12+ chars); remove afterwards |
| `CLOUDINARY_*` | optional, when you have an account |

Redeploy after changing variables.

## 3. First data (run once from your computer, never from Vercel)
Put the Atlas values in a **temporary** shell environment (not a file in the repo), then:
`npm run seed -w server -- --allow-production` creates the products, delivery zones and the owner account. Then sign in at `/admin`, change the password, set real stock (Admin → Inventory), prices, payments and contact details.

## 4. Check it
- `https://<your-domain>/api/v1/health`, `/api/v1/products`, `/api/v1/delivery/zones` return JSON.
- The home page lists the products; a test order can be placed; it appears in Admin → Orders.
- If Vercel "Deployment Protection" is on, visitors must sign in to Vercel — turn it off for Production in Settings → Deployment Protection so customers can open the store.

## Known limits on Vercel
- Rate limits are counted per function instance (in memory), so they are weaker than on a single server. Move them to a shared store before heavy traffic.
- The payment-expiry/notification jobs run from a **daily** Vercel Cron (the free plan allows once a day); the 24-hour stock hold means unpaid prepaid orders release their stock at the next run.
- A cold start adds about a second to the first request.
