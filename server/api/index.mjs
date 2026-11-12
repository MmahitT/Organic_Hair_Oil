// Vercel serverless entry for the API project (Root Directory = server). Every /api/* request is served by the Express app.
// The server is compiled to server/dist by `npm run build` (tsc), so this file only re-exports its handler.
export { default } from '../dist/serverless.js';
