#!/usr/bin/env bash
# Build a clean database from version-controlled migrations only.
# Proves the Phase 0 requirement that no production-only schema drift is required.
#
# The auth schema below is a minimal local stand-in for the pieces Supabase
# provisions (auth.users, auth.uid(), the platform roles). It exists so
# migrations can be verified without a Supabase project; it is not shipped.
set -euo pipefail

DB="${DB:-qentrax}"
export PGHOST="${PGHOST:-/var/tmp}" PGPORT="${PGPORT:-55432}" PGUSER="${PGUSER:-postgres}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

psql -q -c "drop database if exists ${DB};"
psql -q -c "create database ${DB};"

psql -q -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role','supabase_auth_admin','authenticator'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin noinherit', r);
    end if;
  end loop;
end $$;
alter role service_role bypassrls;

create extension if not exists pgcrypto;
create schema if not exists auth;

-- Matches the real Supabase definitions: PostgREST sets request.jwt.claims as
-- a single JSON blob, while the flattened request.jwt.claim.* GUCs are what a
-- direct psql session can set. Both paths are supported so the SQL tests and
-- the PostgREST-backed browser suite exercise the same policies.
create or replace function auth.uid() returns uuid language sql stable as
  $fn$ select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid $fn$;
create or replace function auth.role() returns text language sql stable as
  $fn$ select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  ) $fn$;

-- Supabase grants these to the request roles; the stub must match or RLS
-- policies calling auth.uid() fail with "permission denied for schema auth".
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  last_sign_in_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;
SQL

count=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  if ! out=$(psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" 2>&1); then
    echo "FAILED: $(basename "$f")" >&2
    echo "$out" | grep -A3 ERROR >&2
    exit 1
  fi
  count=$((count + 1))
done
# Supabase grants the request roles table-level access on public and relies on
# RLS for row visibility. Without this, policy tests fail on grants rather than
# exercising the policies.
psql -q -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;
SQL

echo "applied ${count} migrations cleanly to '${DB}'"
