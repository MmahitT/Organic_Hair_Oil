# Website (client)

React + Vite + TypeScript storefront and admin. Deployed as its own Vercel project with Root Directory `client` (see `../DEPLOY.md`).

- `npm run dev` — local site on port 5173; `/api` is proxied to the API (`API_PROXY`, default `http://localhost:5001`)
- `npm run build`, `npm test`, `npm run typecheck`, `npm run lint`
- Production: `vercel.json` forwards `/api/*` to the API project and serves the app shell for other paths. Replace the API host placeholder in its first rewrite before deploying.
- Only public `VITE_*` variables belong here (`client/.env.example`); never a secret.
