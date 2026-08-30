#!/usr/bin/env bash
# Bring up the full local stack the browser suite runs against:
# Postgres -> migrations -> PostgREST -> Supabase-shaped gateway -> Next.js build.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PGHOST="${PGHOST:-/var/tmp}" PGPORT="${PGPORT:-55432}" PGUSER="${PGUSER:-postgres}"
PGRST_BIN="${PGRST_BIN:-$(command -v postgrest || echo /var/tmp/postgrest)}"

# The harness signing key is generated locally and never committed.
if [ ! -s "$ROOT/e2e/harness/jwt-private.pem" ]; then
  node "$ROOT/e2e/harness/generate-keys.mjs"
fi

"$ROOT/scripts/start-postgres.sh"

# Stop anything holding the database open before it is recreated.
pkill -f "postgrest .*postgrest.conf" 2>/dev/null || true
pkill -f "harness/gateway.mjs" 2>/dev/null || true
sleep 1

if [ "${E2E_RESET_DB:-1}" = "1" ]; then
  "$ROOT/scripts/apply-migrations.sh"
fi

psql -q -d qentrax -c "alter role authenticator login; grant anon, authenticated, service_role to authenticator;"
psql -q -v ON_ERROR_STOP=1 -d qentrax -f "$ROOT/e2e/harness/seed.sql"

"$PGRST_BIN" "$ROOT/e2e/harness/postgrest.conf" > /var/tmp/pgrst.log 2>&1 &
node "$ROOT/e2e/harness/gateway.mjs" > /var/tmp/gateway.log 2>&1 &

for _ in $(seq 1 30); do
  curl -sf -o /dev/null "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json" && break
  sleep 0.5
done

cat > "$ROOT/.env.local" <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=e2e-anon-key
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
SUPABASE_SERVICE_ROLE_KEY=e2e-service-key
QENTRAX_ALLOW_SIMULATED_DELIVERY=1
QENTRAX_ALLOW_LOOPBACK_DELIVERY=1
ENV

npm run build

echo "stack up: postgrest :3001, gateway :54321"
