#!/usr/bin/env bash
# Proves cap, budget and idempotency invariants hold under simultaneous
# requests. Each case fires N real concurrent connections at
# reserve_campaign_transaction and asserts the accepted count exactly.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PGHOST="${PGHOST:-/var/tmp}" PGPORT="${PGPORT:-55432}" PGUSER="${PGUSER:-postgres}"
DB="${DB:-qentrax}"

ADV=11111111-1111-1111-1111-111111111111
PUB=22222222-2222-2222-2222-222222222222
VERT=33333333-3333-3333-3333-333333333333
SRC=44444444-4444-4444-4444-444444444444

failures=0
q() { psql -tA -q -d "$DB" -c "$1"; }

setup() {
  "$ROOT/scripts/apply-migrations.sh" >/dev/null
  psql -q -d "$DB" <<SQL
insert into organizations (id, type, legal_name) values
 ('$ADV','advertiser','Concurrency Advertiser'),
 ('$PUB','publisher','Concurrency Publisher');
insert into verticals (id, code, name) values ('$VERT','conc','Concurrency');
insert into publisher_sources (id, publisher_org_id, name) values ('$SRC','$PUB','Concurrency Source');
SQL
}

# fire <campaign_id> <n> <price_cents> [idempotency_key]
# With a fixed key, every request is a retry of the same logical call.
fire() {
  local camp="$1" n="$2" price="$3" fixed_key="${4:-}"
  local opps; opps=$(q "insert into opportunities (public_transaction_id, publisher_org_id, source_id, vertical_id)
      select 'QL-'||gen_random_uuid(), '$PUB','$SRC','$VERT' from generate_series(1,$n)
      returning id;")
  local i=0
  while read -r opp; do
    [ -z "$opp" ] && continue
    i=$((i+1))
    local key="${fixed_key:-key-$camp-$i}"
    local target_opp="$opp"
    # A retry of one logical call reuses the same opportunity too.
    if [ -n "$fixed_key" ]; then target_opp=$(echo "$opps" | head -1); fi
    psql -tA -q -d "$DB" -c "select coalesce(error_code,'OK') from reserve_campaign_transaction(
        '$target_opp'::uuid,'$PUB'::uuid,'$ADV'::uuid,'$camp'::uuid,$price,'$key');" &
  done <<< "$opps"
  wait
}

check() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    echo "PASS  $label (= $expected)"
  else
    echo "FAIL  $label: expected $expected, got $actual"
    failures=$((failures+1))
  fi
}

echo "== concurrency invariants =="
setup

# Daily cap: 40 simultaneous requests, cap of 5.
CAP=55555555-5555-5555-5555-555555555555
q "insert into campaigns (id, advertiser_org_id, name, status, timezone, daily_cap)
   values ('$CAP','$ADV','Cap5','active','America/Los_Angeles',5);" >/dev/null
fire "$CAP" 40 1000 >/dev/null 2>&1
check "daily cap not oversold under 40 concurrent requests" \
  "$(q "select count(*) from transactions where campaign_id='$CAP'")" 5
check "usage counter matches accepted reservations" \
  "$(q "select reservation_count from campaign_daily_usage where campaign_id='$CAP'")" 5

# Daily budget: 40 simultaneous requests at 1000c against a 5000c budget.
BUD=66666666-6666-6666-6666-666666666666
q "insert into campaigns (id, advertiser_org_id, name, status, timezone, daily_budget_cents)
   values ('$BUD','$ADV','Budget5000','active','America/Los_Angeles',5000);" >/dev/null
fire "$BUD" 40 1000 >/dev/null 2>&1
check "daily budget not overspent under 40 concurrent requests" \
  "$(q "select count(*) from transactions where campaign_id='$BUD'")" 5
check "reserved cents never exceed the configured budget" \
  "$(q "select (reserved_cents + charged_cents <= 5000)::int from campaign_daily_usage where campaign_id='$BUD'")" 1

# Hourly cap.
HOUR=77777777-7777-7777-7777-777777777777
q "insert into campaigns (id, advertiser_org_id, name, status, timezone, hourly_cap)
   values ('$HOUR','$ADV','Hourly3','active','America/Los_Angeles',3);" >/dev/null
fire "$HOUR" 25 1000 >/dev/null 2>&1
check "hourly cap not oversold under 25 concurrent requests" \
  "$(q "select count(*) from transactions where campaign_id='$HOUR'")" 3

# Idempotency: 20 simultaneous retries of one logical call must bill once.
IDEM=88888888-8888-8888-8888-888888888888
q "insert into campaigns (id, advertiser_org_id, name, status, timezone, daily_cap)
   values ('$IDEM','$ADV','Idem','active','America/Los_Angeles',100);" >/dev/null
fire "$IDEM" 20 1000 "same-key" >/dev/null 2>&1
check "concurrent retries of one idempotency key create one transaction" \
  "$(q "select count(*) from transactions where campaign_id='$IDEM'")" 1

echo
if [ "$failures" -eq 0 ]; then echo "all concurrency invariants held"; else echo "$failures invariant(s) violated"; fi
exit $failures
