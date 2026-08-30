#!/usr/bin/env bash
# Bring up the full local stack the browser suite runs against:
# Postgres -> migrations -> PostgREST -> Supabase-shaped gateway -> Next.js build.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PGHOST="${PGHOST:-/var/tmp}" PGPORT="${PGPORT:-55432}" PGUSER="${PGUSER:-postgres}"
PGRST_BIN="${PGRST_BIN:-$(command -v postgrest || echo /var/tmp/postgrest)}"

if ! grep -q "buyer.qentrax.test" /etc/hosts; then
  echo "127.0.0.1 buyer.qentrax.test" | sudo tee -a /etc/hosts >/dev/null
fi

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

SERVICE_ROLE_KEY="$(
  node <<'NODE'
const { createSign } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const privateKey = readFileSync(path.join(process.cwd(), "e2e/harness/jwt-private.pem"), "utf8");
const b64url = (value) => Buffer.from(value).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const header = { alg: "RS256", typ: "JWT", kid: "qentrax-e2e" };
const payload = {
  iss: "http://127.0.0.1:54321/auth/v1",
  aud: "authenticated",
  role: "service_role",
  sub: "00000000-0000-0000-0000-0000000000fe",
  iat: now,
  exp: now + 3600,
};
const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
const signer = createSign("RSA-SHA256");
signer.update(signingInput);
process.stdout.write(`${signingInput}.${signer.sign(privateKey, "base64url")}`);
NODE
)"

(cd "$ROOT/e2e/harness" && "$PGRST_BIN" postgrest.conf) > /var/tmp/pgrst.log 2>&1 &
node "$ROOT/e2e/harness/gateway.mjs" > /var/tmp/gateway.log 2>&1 &

for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json" 2>/dev/null && \
     curl -sf -o /dev/null "http://127.0.0.1:3001/" 2>/dev/null; then
    break
  fi
  sleep 0.5
done

# Verify both services are responding
echo "Verifying stack health..."
if ! curl -sf -o /dev/null "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json" 2>/dev/null; then
  echo "ERROR: Gateway not responding at http://127.0.0.1:54321" >&2
  tail -20 /var/tmp/gateway.log || true
  exit 1
fi
if ! curl -sf -o /dev/null "http://127.0.0.1:3001/" 2>/dev/null; then
  echo "ERROR: PostgREST not responding at http://127.0.0.1:3001" >&2
  tail -20 /var/tmp/pgrst.log || true
  exit 1
fi
echo "Stack health verified"

cat > "$ROOT/.env.local" <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=e2e-anon-key
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
QENTRAX_ALLOW_SIMULATED_DELIVERY=1
QENTRAX_ALLOW_LOOPBACK_DELIVERY=1
ENV

npm run build

echo "stack up: postgrest :3001, gateway :54321"
