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

create or replace function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
create or replace function auth.role() returns text language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.role', true), '') $fn$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  last_sign_in_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
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
echo "applied ${count} migrations cleanly to '${DB}'"
