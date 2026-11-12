# API (server)

Express + TypeScript + MongoDB REST API under `/api/v1`. Deployed as its own Vercel project with Root Directory `server` (see `../DEPLOY.md`).

- `npm run dev` — local server on port 5001 (needs `server/.env`, copy `server/.env.example`)
- `npm run build` / `npm start` — compile to `dist/` and run
- `npm test`, `npm run typecheck`, `npm run lint`
- `npm run seed` — idempotent seed (products, delivery zones, first owner); production needs `--allow-production`
- Vercel: `vercel.json`, `api/index.mjs` → `dist/serverless.js`; daily cron `/api/v1/internal/jobs` guarded by `CRON_SECRET`

Secrets live only in environment variables (never committed). In production `CORS_ORIGINS` must list only the website address.
