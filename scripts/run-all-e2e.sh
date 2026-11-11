#!/bin/sh
# Runs every browser + load test against a THROWAWAY database (never your real one) and prints a summary.
#   1. needs the dev MongoDB running (npm run dev:db) and server/.env filled in;
#   2. builds the site, serves it with `vite preview` (production security headers), starts the API;
#   3. for each script: drops/re-seeds the throwaway DB, restarts the API (clears the login rate limiter), runs it.
# Takes roughly 25 minutes (the order-tracking test waits out a 1-minute rate limit several times).
# It uses its OWN API on port 5002 (the website preview on 4173 forwards /api there), so the normal dev stack
# (API 5001, site 5173) can keep running.
# Usage:  sh scripts/run-all-e2e.sh [outDir] [script ...]
#         outDir = where screenshots/logs go (default ./e2e-output); script names (e.g. e2e-seo e2e-csp) = run only those.
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=${1:-"$ROOT/e2e-output"}
[ $# -gt 0 ] && shift
API_PORT=5002
DB=beauty_organic_verify_all
mkdir -p "$OUT"
cd "$ROOT"
set -a; . server/.env; set +a
export MONGODB_DB_NAME=$DB

echo "Building the site (with VITE_SITE_URL so canonical/sitemap exist)…"
VITE_SITE_URL=http://localhost:4173 npm run build -w client >"$OUT/build.log" 2>&1 || { echo "build failed, see $OUT/build.log"; exit 1; }
pkill -f "vite preview --port 4173" 2>/dev/null; sleep 1
(cd client && API_PROXY=http://localhost:$API_PORT nohup npx vite preview --port 4173 >"$OUT/preview.log" 2>&1 &)

reset_db() {
  (cd server && node -e "import('mongodb').then(async ({MongoClient})=>{const c=await MongoClient.connect(process.env.MONGODB_URI);await c.db('$DB').dropDatabase();await c.close();})") >/dev/null 2>&1
  npm run seed -w server >/dev/null 2>&1
}
kill_api() {
  # kill whatever listens on the test API port (the real node process, not just the npx wrapper) so rate-limit counters reset
  # (graceful shutdown keeps existing keep-alive connections alive, so wait for the port to be free and force it if needed)
  for p in $(lsof -ti tcp:$API_PORT 2>/dev/null); do kill $p 2>/dev/null; done
  i=0; while [ -n "$(lsof -ti tcp:$API_PORT 2>/dev/null)" ] && [ $i -lt 8 ]; do i=$((i+1)); sleep 1; done
  for p in $(lsof -ti tcp:$API_PORT 2>/dev/null); do kill -9 $p 2>/dev/null; done; sleep 1
}
start_preview() {
  # a fresh preview server per script, so no proxy connection to an old API survives
  pkill -f "vite preview --port 4173" 2>/dev/null; i=0; while [ -n "$(lsof -ti tcp:4173 2>/dev/null)" ] && [ $i -lt 8 ]; do i=$((i+1)); sleep 1; done
  (cd client && API_PROXY=http://localhost:$API_PORT nohup npx vite preview --port 4173 >"$OUT/preview.log" 2>&1 &)
  i=0; until curl -sf localhost:4173/ >/dev/null 2>&1; do i=$((i+1)); [ $i -gt 30 ] && { echo "site did not start"; exit 1; }; sleep 1; done
}
start_api() {
  kill_api
  (cd server && PORT=$API_PORT FRONTEND_URL=http://localhost:4173 CORS_ORIGINS=http://localhost:4173 TRUST_PROXY=${1:-false} nohup npx tsx src/index.ts >"$OUT/api.log" 2>&1 &)
  i=0; until curl -sf localhost:$API_PORT/api/v1/health >/dev/null 2>&1; do i=$((i+1)); [ $i -gt 40 ] && { echo "API did not start"; exit 1; }; sleep 1; done
}

SUMMARY=""
run() {
  name=$1; trust=${2:-false}
  reset_db; start_api "$trust"; start_preview
  echo "=== $name ==="
  ADMIN_EMAIL=$SEED_ADMIN_EMAIL ADMIN_PW=$SEED_ADMIN_PASSWORD node "scripts/$name.mjs" http://localhost:4173 "$OUT" >"$OUT/$name.log" 2>&1
  code=$?
  pass=$(grep -c '^PASS' "$OUT/$name.log"); fail=$(grep -c '^FAIL' "$OUT/$name.log")
  if [ $code -eq 0 ]; then SUMMARY="$SUMMARY\n  OK     $name ($pass checks)"; else SUMMARY="$SUMMARY\n  FAILED $name ($pass passed, $fail failed) — see $OUT/$name.log"; fi
}

LIST="${*:-e2e-catalog e2e-staff e2e-checkout e2e-inline-order e2e-manual-payments e2e-orders e2e-admin e2e-seo e2e-csp e2e-scenarios e2e-responsive}"
for s in $LIST; do case $s in load-concurrency|scan-secrets) ;; *) run $s;; esac; done
# the load test starts the API behind TRUST_PROXY so each simulated customer has its own address
case " $LIST " in *load-concurrency*|*" e2e-catalog "*) reset_db; start_api true; start_preview
echo "=== load-concurrency ==="
ADMIN_EMAIL=$SEED_ADMIN_EMAIL ADMIN_PW=$SEED_ADMIN_PASSWORD node scripts/load-concurrency.mjs http://localhost:$API_PORT/api/v1 >"$OUT/load-concurrency.log" 2>&1 && SUMMARY="$SUMMARY\n  OK     load-concurrency" || SUMMARY="$SUMMARY\n  FAILED load-concurrency — see $OUT/load-concurrency.log"
esac
case " $LIST " in *scan-secrets*|*" e2e-catalog "*) node scripts/scan-secrets.mjs >"$OUT/scan-secrets.log" 2>&1 && SUMMARY="$SUMMARY\n  OK     scan-secrets" || SUMMARY="$SUMMARY\n  FAILED scan-secrets — see $OUT/scan-secrets.log"

esac
kill_api; pkill -f "vite preview --port 4173" 2>/dev/null
echo; echo "SUMMARY"; printf "$SUMMARY\n"
case "$SUMMARY" in *FAILED*) exit 1;; esac
