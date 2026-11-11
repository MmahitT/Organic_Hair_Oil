// Vercel serverless entry: every /api/* request is served by the Express app (see vercel.json rewrites).
// The server is compiled to server/dist by `npm run build` (tsc), so this file only re-exports its handler.
export { default } from '../server/dist/serverless.js';
