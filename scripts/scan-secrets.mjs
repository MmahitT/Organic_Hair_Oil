// Secret scan (spec §14: "no secrets in the repository or the client bundle").
//  1. Looks through every source/doc/config file for private keys, cloud keys and hard-coded credentials.
//  2. Checks that no .env file (other than the .env.example templates) would be committed.
//  3. Looks in the BUILT website (client/dist) for the actual secret values from server/.env and for server-only names.
// Exit code 1 on any finding. Usage: node scripts/scan-secrets.mjs
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';

/** True when git would ignore this path (so it can never be committed by accident). */
const gitIgnored = (rel) => { try { execFileSync('git', ['check-ignore', '-q', rel], { stdio: 'ignore' }); return true; } catch { return false; } };

const root = process.cwd();
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.data', 'coverage', '.vite']);
const SKIP_FILES = /\.(png|jpe?g|webp|avif|ico|woff2?|ttf|lock|map)$|package-lock\.json$/i;
// test files and docs legitimately contain fake credentials / examples
const ALLOW = /\.test\.(ts|tsx)$|[\\/]test[\\/]|vitest\.config\.ts$|e2e-.*\.mjs$|SECURITY_REVIEW\.md$|TESTING\.md$|PROJECT_SPECIFICATION\.md$|DEVELOPMENT_PROGRESS\.md$|README\.md$|CLAUDE\.md$|scan-secrets\.mjs$/;

const PATTERNS = [
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack/GitHub token', /\b(?:xox[abprs]-[0-9A-Za-z-]{10,}|gh[pousr]_[0-9A-Za-z]{30,})\b/],
  ['Cloudinary URL with secret', /cloudinary:\/\/\d+:[^@\s]+@/],
  ['MongoDB URI with password', /mongodb(?:\+srv)?:\/\/[^:\s/]+:[^@\s]{3,}@/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\b/],
  ['hard-coded secret assignment', /\b(?:JWT_[A-Z_]*SECRET|API_SECRET|CLIENT_SECRET|PASSWORD|STORE_PASSWORD)\s*[:=]\s*['"][^'"\s]{12,}['"]/],
];

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p); } else if (!SKIP_FILES.test(name) && st.size < 1_500_000) files.push(p);
  }
})(root);

const findings = [];
for (const f of files) {
  const rel = relative(root, f);
  if (/(^|[\\/])\.env(\.|$)/.test(rel) && !/\.env\.example$/.test(rel)) { if (!gitIgnored(rel)) findings.push(`${rel}: an .env file is NOT ignored by git — it could be committed`); continue; }
  if (ALLOW.test(rel)) continue;
  const text = readFileSync(f, 'utf8');
  for (const [label, re] of PATTERNS) {
    const m = re.exec(text);
    if (m) findings.push(`${rel}: ${label} → ${m[0].slice(0, 40)}…`);
  }
}

// .gitignore must cover env files and build output
const gi = existsSync('.gitignore') ? readFileSync('.gitignore', 'utf8') : '';
for (const need of ['.env', 'node_modules', 'dist']) if (!gi.split('\n').some((l) => l.trim().startsWith(need) || l.trim().startsWith(`*${need}`))) findings.push(`.gitignore does not cover "${need}"`);
if (!/!\.env\.example/.test(gi)) findings.push('.gitignore should keep the .env.example templates (!.env.example)');

// The built website must not contain the real server secrets or server-only variable names.
const dist = join(root, 'client', 'dist');
const secrets = [];
const envFile = join(root, 'server', '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]*(?:SECRET|PASSWORD|API_KEY|TOKEN)[A-Z0-9_]*)=(.{6,})$/.exec(line.trim());
    if (m) secrets.push([m[1], m[2]]);
  }
}
let bundleFiles = 0;
if (existsSync(dist)) {
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(js|css|html|json|txt|xml|map)$/.test(name)) continue;
      bundleFiles++;
      const text = readFileSync(p, 'utf8');
      for (const [k, v] of secrets) if (text.includes(v)) findings.push(`client/dist/${relative(dist, p)}: contains the value of ${k}`);
      for (const bad of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'CLOUDINARY_API_SECRET', 'BCRYPT_SALT_ROUNDS', 'MONGODB_URI', 'SEED_ADMIN_PASSWORD']) if (text.includes(bad)) findings.push(`client/dist/${relative(dist, p)}: mentions server-only name ${bad}`);
      for (const [label, re] of PATTERNS.slice(0, 7)) { const m = re.exec(text); if (m) findings.push(`client/dist/${relative(dist, p)}: ${label}`); }
    }
  })(dist);
} else console.log('note: client/dist not found — build the site first to scan the bundle');

console.log(`Scanned ${files.length} source files, ${bundleFiles} bundle files, checked ${secrets.length} secret values from server/.env.`);
if (findings.length) { console.log('\nFINDINGS:'); for (const f of findings) console.log(' -', f); process.exit(1); }
console.log('No secrets found.');
