#!/usr/bin/env bash
# Rebuild a clean database from migrations, then run every SQL test against it.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PGHOST="${PGHOST:-/var/tmp}" PGPORT="${PGPORT:-55432}" PGUSER="${PGUSER:-postgres}"
DB="${DB:-qentrax}"

"$ROOT/scripts/apply-migrations.sh"

failed=0
for t in "$ROOT"/supabase/tests/*.sql; do
  name="$(basename "$t")"
  if out=$(psql -v ON_ERROR_STOP=1 -d "$DB" -f "$t" 2>&1); then
    echo "PASS  $name"
  else
    echo "FAIL  $name"
    echo "$out" | grep -E "ERROR|DETAIL" | sed 's/^/      /'
    failed=1
  fi
done
exit $failed
