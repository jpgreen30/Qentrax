#!/usr/bin/env bash
# Start a throwaway local Postgres for migration and RLS testing.
# Idempotent: safe to re-run after the container recycles the process.
set -euo pipefail
export PATH="$PATH:/usr/lib/postgresql/16/bin"
D="${PGDATA_DIR:-/var/tmp/pgdata}"
PORT="${PGPORT:-55432}"
SOCK="${PGHOST:-/var/tmp}"
PG_OWNER="${PGTEST_USER:-}"

if [ -z "$PG_OWNER" ]; then
  if id pgtest >/dev/null 2>&1; then
    PG_OWNER=pgtest
  elif [ "$(id -u)" -eq 0 ] && id postgres >/dev/null 2>&1; then
    PG_OWNER=postgres
  elif [ "$(id -u)" -eq 0 ] && command -v useradd >/dev/null 2>&1; then
    useradd -m pgtest
    PG_OWNER=pgtest
  elif [ "$(id -u)" -eq 0 ]; then
    echo "start-postgres.sh requires an existing unprivileged user or useradd when running as root" >&2
    exit 1
  else
    PG_OWNER="$(id -un)"
  fi
fi

if pg_isready -h "$SOCK" -p "$PORT" >/dev/null 2>&1; then
  echo "postgres already up on $SOCK:$PORT"
  exit 0
fi

if [ ! -s "$D/PG_VERSION" ]; then
  rm -rf "$D"; mkdir -p "$D"
  if [ "$PG_OWNER" != "$(id -un)" ]; then
    chown "$PG_OWNER" "$D"
  fi
  if [ "$PG_OWNER" = "$(id -un)" ]; then
    PATH="$PATH:/usr/lib/postgresql/16/bin" initdb -D "$D" -U postgres --auth=trust >/dev/null
  else
    su "$PG_OWNER" -c "PATH=\$PATH:/usr/lib/postgresql/16/bin initdb -D $D -U postgres --auth=trust" >/dev/null
  fi
fi
if [ "$PG_OWNER" != "$(id -un)" ]; then
  chown -R "$PG_OWNER" "$D"
fi
if [ "$PG_OWNER" = "$(id -un)" ]; then
  PATH="$PATH:/usr/lib/postgresql/16/bin" pg_ctl -D "$D" -o "-p $PORT -k $SOCK" -l "$D/log.txt" start >/dev/null
else
  su "$PG_OWNER" -c "PATH=\$PATH:/usr/lib/postgresql/16/bin pg_ctl -D $D -o '-p $PORT -k $SOCK' -l $D/log.txt start" >/dev/null
fi

for _ in $(seq 1 20); do
  pg_isready -h "$SOCK" -p "$PORT" >/dev/null 2>&1 && { echo "postgres up on $SOCK:$PORT"; exit 0; }
  sleep 0.5
done
echo "postgres failed to start; see $D/log.txt" >&2
tail -20 "$D/log.txt" >&2 || true
exit 1
