#!/usr/bin/env bash
# Start a throwaway local Postgres for migration and RLS testing.
# Idempotent: safe to re-run after the container recycles the process.
set -euo pipefail
export PATH="$PATH:/usr/lib/postgresql/16/bin"
D="${PGDATA_DIR:-/var/tmp/pgdata}"
PORT="${PGPORT:-55432}"
SOCK="${PGHOST:-/var/tmp}"

if pg_isready -h "$SOCK" -p "$PORT" >/dev/null 2>&1; then
  echo "postgres already up on $SOCK:$PORT"
  exit 0
fi

# initdb refuses to run as root, so the cluster is owned by an unprivileged user.
id pgtest >/dev/null 2>&1 || useradd -m pgtest
if [ ! -s "$D/PG_VERSION" ]; then
  rm -rf "$D"; mkdir -p "$D"; chown pgtest "$D"
  su pgtest -c "PATH=\$PATH:/usr/lib/postgresql/16/bin initdb -D $D -U postgres --auth=trust" >/dev/null
fi
chown -R pgtest "$D"
su pgtest -c "PATH=\$PATH:/usr/lib/postgresql/16/bin pg_ctl -D $D -o '-p $PORT -k $SOCK' -l $D/log.txt start" >/dev/null

for _ in $(seq 1 20); do
  pg_isready -h "$SOCK" -p "$PORT" >/dev/null 2>&1 && { echo "postgres up on $SOCK:$PORT"; exit 0; }
  sleep 0.5
done
echo "postgres failed to start; see $D/log.txt" >&2
tail -20 "$D/log.txt" >&2 || true
exit 1
