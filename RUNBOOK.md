# Runbook — running the live store

Setup steps are in `DEPLOY.md`. This file is for day-to-day operation and emergencies.

## Is the store healthy?
- `node scripts/smoke-production.mjs https://<your-domain>` — read-only; checks the home page, deep links, security headers, API health, products, delivery zones, CORS, locked admin routes. Run it after **every** deployment.
- Free uptime monitor (e.g. UptimeRobot): watch `https://<your-domain>/api/v1/health` every 5 minutes (it answers 503 when the database is down) and e-mail/SMS the owner.
- Vercel → project → Logs shows API errors (secrets and personal data are scrubbed from logs).

## Deploying a change
1. `npm run typecheck && npm run lint && npm test && npm run build` (GitHub Actions runs the same on every push).
2. Push to `main` → Vercel builds automatically. Open the **Preview/Production** deployment, wait for **Ready**.
3. Run the smoke test above. If anything fails, roll back.

## Rolling back (about 1 minute)
Vercel → Deployments → pick the last good deployment → **⋯ → Promote to Production** (or **Instant Rollback**). No data is lost; the database is separate.

## Backups
- **Atlas M0 (free) has no automatic backups.** Before real customers: upgrade to M10+ (paid — owner approval) or run a weekly dump yourself: `mongodump --uri "<MONGODB_URI>" --db beauty_organic --out ./backup-$(date +%F)` and store it somewhere private (never in Git).
- Also export orders regularly: Admin → Orders → Export, and Admin → Payments → Export.
- Test a restore on a scratch database (`mongorestore --nsFrom/--nsTo`) at least once before launch.

## Incidents
| Symptom | First checks |
|---|---|
| Store shows "could not be loaded" | `/api/v1/health` → 503 means database: Atlas up? `MONGODB_URI` correct? Atlas network access allows `0.0.0.0/0`? 500 → Vercel Logs for the boot error (a missing/unsafe environment variable stops the API with a clear message). |
| Customers cannot sign in to admin | Wait 15 minutes (rate limit), check `COOKIE_SECURE=true`, same domain for site and API. |
| Prepaid orders keep stock too long | Free Vercel Cron runs once a day; trigger manually: `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/v1/internal/jobs`. |
| Suspected leaked secret | Rotate immediately (new Atlas password, new JWT secrets — this signs everyone out, new `CRON_SECRET`), redeploy, then review Admin → Activity log. |

## Routine
- Change the owner password after first sign-in; use a unique long password; remove unused staff accounts.
- Enable GitHub secret scanning + Dependabot alerts; review `npm audit` monthly.
- Set real stock before opening; check delivery fees and payment details (Admin → Website / Payments).
