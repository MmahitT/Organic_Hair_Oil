// Vercel looks for the built website in a root-level "dist" folder. The site is built into client/dist, so copy it there.
import { cpSync, existsSync, rmSync } from 'node:fs';
if (!existsSync('client/dist/index.html')) { console.error('client/dist/index.html is missing — the website build did not run.'); process.exit(1); }
rmSync('dist', { recursive: true, force: true });
cpSync('client/dist', 'dist', { recursive: true });
console.log('Copied client/dist -> dist');
