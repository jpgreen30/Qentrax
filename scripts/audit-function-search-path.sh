#!/usr/bin/env bash
# Static audit of database functions for search_path hazards.
#
# Three separate migrations in this repo shipped a function that failed under
# `set search_path = ''` because a SQL *special form* was written as though it
# were a schema-qualifiable function (pg_catalog.nullif, pg_catalog.coalesce,
# pg_catalog.extract). This finds the rest of that class, plus SECURITY DEFINER
# functions that carry no search_path setting at all — the classic privilege
# escalation vector, since an attacker-controlled search_path then decides which
# objects the definer-rights function touches.
set -uo pipefail
export PGHOST="${PGHOST:-/var/tmp}" PGPORT="${PGPORT:-55432}" PGUSER="${PGUSER:-postgres}"
DB="${DB:-qentrax}"
findings=0

section() { echo; echo "== $1 =="; }

section "SECURITY DEFINER functions without a search_path setting"
rows=$(psql -tA -d "$DB" <<'SQL'
select n.nspname || '.' || p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (
    select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
  )
order by 1;
SQL
)
if [ -n "$rows" ]; then echo "$rows" | sed 's/^/  MISSING search_path: /'; findings=$((findings+1)); else echo "  none"; fi

section "Schema-qualified SQL special forms (not qualifiable; fail under empty search_path)"
# These are parser constructs, not pg_catalog functions.
rows=$(psql -tA -d "$DB" <<'SQL'
select n.nspname || '.' || p.proname || '  ->  ' || m[1]
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace,
lateral (
  select m from regexp_matches(
    pg_get_functiondef(p.oid),
    '(pg_catalog\.(?:nullif|coalesce|greatest|least|extract|overlay|position|substring|trim|cast|case|exists|row)\s*\()',
    'gi') as m
) x
where n.nspname = 'public'
order by 1;
SQL
)
if [ -n "$rows" ]; then echo "$rows" | sed 's/^/  UNQUALIFIABLE: /'; findings=$((findings+1)); else echo "  none"; fi

section "Functions with an empty search_path calling unqualified relations"
# Heuristic: an empty search_path plus a bare public table reference.
rows=$(psql -tA -d "$DB" <<'SQL'
select n.nspname || '.' || p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c = 'search_path=')
  and pg_get_functiondef(p.oid) ~* '(from|join|into|update)\s+(?!public\.|pg_catalog\.|unnest|generate_series|lateral)[a-z_]+\s'
order by 1;
SQL
)
if [ -n "$rows" ]; then echo "$rows" | sed 's/^/  REVIEW: /'; else echo "  none"; fi

echo
if [ "$findings" -eq 0 ]; then
  echo "search_path audit: clean"
else
  echo "search_path audit: $findings category(ies) with findings"
fi
exit $findings
