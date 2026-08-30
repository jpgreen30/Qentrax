#!/usr/bin/env bash
# Rehearse the exact production migration delta on disposable Postgres.
#
# The job simulates an in-place upgrade:
#   1) build the database through the current live boundary
#   2) seed representative pre-upgrade data
#   3) capture baseline row/state snapshots
#   4) apply only the missing delta migrations
#   5) prove the seeded state survives unchanged
#   6) verify the new schema is visible through PostgREST
#   7) run the SQL acceptance tests against the upgraded database
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$PATH:/usr/lib/postgresql/16/bin"
export PGHOST="${PGHOST:-/var/tmp}"
export PGPORT="${PGPORT:-55432}"
export PGUSER="${PGUSER:-postgres}"
DB="${DB:-qentrax}"
LIVE_BOUNDARY_VERSION="${LIVE_BOUNDARY_VERSION:-20260830030000}"
DELTA_START="${DELTA_START:-20260830040000}"
DELTA_END="${DELTA_END:-20260830120000}"
PGRST_BIN="${PGRST_BIN:-$(command -v postgrest || echo /var/tmp/postgrest)}"
PGRST_LOG="${PGRST_LOG:-/var/tmp/qentrax-postgrest-rehearsal.log}"

PLATFORM_ORG_ID="d0000000-0000-0000-0000-00000000f101"
ADVERTISER_ORG_ID="d0000000-0000-0000-0000-00000000f102"
PUBLISHER_ORG_ID="d0000000-0000-0000-0000-00000000f103"

ADMIN_AUTH_ID="d0000000-0000-0000-0000-00000000a101"
BUYER_AUTH_ID="d0000000-0000-0000-0000-00000000a102"
PUBLISHER_AUTH_ID="d0000000-0000-0000-0000-00000000a103"

VERTICAL_ID="d0000000-0000-0000-0000-00000000b101"
PRODUCT_ID="d0000000-0000-0000-0000-00000000b102"
SOURCE_ID="d0000000-0000-0000-0000-00000000b103"
CAMPAIGN_ID="d0000000-0000-0000-0000-00000000c101"
CAMPAIGN_VERSION_ID="d0000000-0000-0000-0000-00000000c102"
ENDPOINT_ID="d0000000-0000-0000-0000-00000000c103"
OPPORTUNITY_ID="d0000000-0000-0000-0000-00000000d101"
AUCTION_RUN_ID="d0000000-0000-0000-0000-00000000d102"
DELIVERY_ID="d0000000-0000-0000-0000-00000000d103"
TRANSACTION_ID=""

log() {
  printf '%s\n' "$*"
}

apply_sql_file() {
  local file="$1"
  log "APPLY $(basename "$file")"
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$file" >/dev/null
}

apply_migrations_through() {
  local stop_version="$1"
  local file version
  while IFS= read -r file; do
    version="$(basename "$file" .sql)"
    version="${version%%_*}"
    if [[ "$version" > "$stop_version" ]]; then
      break
    fi
    apply_sql_file "$file"
  done < <(printf '%s\n' "$ROOT"/supabase/migrations/*.sql | sort)
}

apply_migrations_range() {
  local start_version="$1"
  local end_version="$2"
  local file version
  while IFS= read -r file; do
    version="$(basename "$file" .sql)"
    version="${version%%_*}"
    if [[ "$version" < "$start_version" ]]; then
      continue
    fi
    if [[ "$version" > "$end_version" ]]; then
      break
    fi
    apply_sql_file "$file"
  done < <(printf '%s\n' "$ROOT"/supabase/migrations/*.sql | sort)
}

capture_state() {
  psql -q -At -v ON_ERROR_STOP=1 -d "$DB" <<SQL
select jsonb_build_object(
  'roles', (select count(*) from public.roles),
  'role_permissions', (select count(*) from public.role_permissions),
  'organizations', (select count(*) from public.organizations),
  'users', (select count(*) from public.users),
  'organization_members', (select count(*) from public.organization_members),
  'verticals', (select count(*) from public.verticals),
  'products', (select count(*) from public.products),
  'publisher_sources', (select count(*) from public.publisher_sources),
  'source_verticals', (select count(*) from public.source_verticals),
  'consent_templates', (select count(*) from public.consent_templates),
  'campaigns', (select count(*) from public.campaigns),
  'campaign_versions', (select count(*) from public.campaign_versions),
  'campaign_endpoints', (select count(*) from public.campaign_endpoints),
  'financial_accounts', (select count(*) from public.financial_accounts),
  'journals', (select count(*) from public.journals),
  'ledger_entries', (select count(*) from public.ledger_entries),
  'opportunities', (select count(*) from public.opportunities),
  'consent_evidence', (select count(*) from public.consent_evidence),
  'validation_runs', (select count(*) from public.validation_runs),
  'validation_results', (select count(*) from public.validation_results),
  'auction_runs', (select count(*) from public.auction_runs),
  'auction_candidates', (select count(*) from public.auction_candidates),
  'deliveries', (select count(*) from public.deliveries),
  'transactions', (select count(*) from public.transactions),
  'transaction_events', (select count(*) from public.transaction_events),
  'reserved_cents', coalesce((select sum(reserved_cents) from public.campaign_daily_usage), 0),
  'charged_cents', coalesce((select sum(charged_cents) from public.campaign_daily_usage), 0),
  'reservation_count', coalesce((select sum(reservation_count) from public.campaign_daily_usage), 0),
  'accepted_count', coalesce((select sum(accepted_count) from public.campaign_daily_usage), 0),
  'campaign_status', coalesce((select status from public.campaigns where id = '$CAMPAIGN_ID'), 'missing'),
  'campaign_timezone', coalesce((select timezone from public.campaigns where id = '$CAMPAIGN_ID'), 'missing'),
  'delivery_status', coalesce((select status from public.deliveries where id = '$DELIVERY_ID'), 'missing'),
  'transaction_status', coalesce((select status from public.transactions where opportunity_id = '$OPPORTUNITY_ID'), 'missing'),
  'transaction_price_cents', coalesce((select advertiser_price_cents from public.transactions where opportunity_id = '$OPPORTUNITY_ID'), 0),
  'transaction_margin_cents', coalesce((select platform_margin_cents from public.transactions where opportunity_id = '$OPPORTUNITY_ID'), 0)
)::text;
SQL
}

assert_rows() {
  local label="$1"
  local expected="$2"
  local actual
  actual="$(capture_state)"
  if [[ "$actual" != "$expected" ]]; then
    printf 'STATE MISMATCH (%s)\nexpected: %s\nactual:   %s\n' "$label" "$expected" "$actual" >&2
    exit 1
  fi
  log "STATE OK: $label"
}

seed_baseline_data() {
  psql -q -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
set search_path = public;

insert into roles (id, code, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin_superuser',  'Platform Superuser'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin_compliance', 'Platform Compliance'),
  ('00000000-0000-0000-0000-0000000000a3', 'admin_finance',    'Platform Finance'),
  ('00000000-0000-0000-0000-0000000000b1', 'advertiser_owner',   'Advertiser Owner'),
  ('00000000-0000-0000-0000-0000000000b2', 'advertiser_manager', 'Advertiser Manager'),
  ('00000000-0000-0000-0000-0000000000b3', 'advertiser_analyst', 'Advertiser Analyst'),
  ('00000000-0000-0000-0000-0000000000c1', 'publisher_owner',   'Publisher Owner'),
  ('00000000-0000-0000-0000-0000000000c2', 'publisher_manager', 'Publisher Manager'),
  ('00000000-0000-0000-0000-0000000000c3', 'publisher_analyst', 'Publisher Analyst')
on conflict (id) do update
  set code = excluded.code,
      name = excluded.name;

insert into role_permissions (role_id, permission_code)
select r.id, p.permission_code
from roles r
join (values
  ('admin_superuser',  'platform.manage'),
  ('admin_superuser',  'vertical.write'),
  ('admin_superuser',  'offer.write'),
  ('admin_superuser',  'organization.manage'),
  ('admin_superuser',  'campaign.read_all'),
  ('admin_superuser',  'delivery.replay'),
  ('admin_superuser',  'audit.read'),
  ('admin_superuser',  'finance.manage'),

  ('admin_compliance', 'vertical.read'),
  ('admin_compliance', 'offer.read'),
  ('admin_compliance', 'organization.manage'),
  ('admin_compliance', 'campaign.read_all'),
  ('admin_compliance', 'audit.read'),

  ('admin_finance',    'finance.manage'),
  ('admin_finance',    'campaign.read_all'),
  ('admin_finance',    'audit.read'),

  ('advertiser_owner',   'campaign.write'),
  ('advertiser_owner',   'campaign.read'),
  ('advertiser_owner',   'integration.write'),
  ('advertiser_owner',   'report.read'),
  ('advertiser_owner',   'conversion.write'),
  ('advertiser_owner',   'billing.manage'),
  ('advertiser_owner',   'member.manage'),

  ('advertiser_manager', 'campaign.write'),
  ('advertiser_manager', 'campaign.read'),
  ('advertiser_manager', 'integration.write'),
  ('advertiser_manager', 'report.read'),
  ('advertiser_manager', 'conversion.write'),

  ('advertiser_analyst', 'campaign.read'),
  ('advertiser_analyst', 'report.read'),

  ('publisher_owner',   'source.write'),
  ('publisher_owner',   'source.read'),
  ('publisher_owner',   'demand.read'),
  ('publisher_owner',   'report.read'),
  ('publisher_owner',   'payout.manage'),
  ('publisher_owner',   'member.manage'),

  ('publisher_manager', 'source.write'),
  ('publisher_manager', 'source.read'),
  ('publisher_manager', 'demand.read'),
  ('publisher_manager', 'report.read'),

  ('publisher_analyst', 'source.read'),
  ('publisher_analyst', 'report.read')
) as p(role_code, permission_code) on p.role_code = r.code
on conflict do nothing;

insert into organizations (id, type, legal_name, status, onboarding_status) values
  ('d0000000-0000-0000-0000-00000000f101', 'platform',   'Upgrade Platform',  'active', 'approved'),
  ('d0000000-0000-0000-0000-00000000f102', 'advertiser', 'Upgrade Advertiser', 'active', 'approved'),
  ('d0000000-0000-0000-0000-00000000f103', 'publisher',   'Upgrade Publisher',  'active', 'approved')
on conflict (id) do nothing;

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('d0000000-0000-0000-0000-00000000a101', 'admin@upgrade.test', '{"display_name":"Upgrade Admin"}', '{}'::jsonb),
  ('d0000000-0000-0000-0000-00000000a102', 'buyer@upgrade.test', '{"display_name":"Upgrade Buyer"}', '{}'::jsonb),
  ('d0000000-0000-0000-0000-00000000a103', 'publisher@upgrade.test', '{"display_name":"Upgrade Publisher"}', '{}'::jsonb)
on conflict (id) do update
  set email = excluded.email,
      raw_user_meta_data = excluded.raw_user_meta_data,
      raw_app_meta_data = excluded.raw_app_meta_data;

insert into organization_members (organization_id, user_id, role_id, status)
select 'd0000000-0000-0000-0000-00000000f101', u.id, r.id, 'active'
from users u, roles r
where u.auth_subject = 'd0000000-0000-0000-0000-00000000a101'
  and r.code = 'admin_superuser'
on conflict do nothing;

insert into organization_members (organization_id, user_id, role_id, status)
select 'd0000000-0000-0000-0000-00000000f102', u.id, r.id, 'active'
from users u, roles r
where u.auth_subject = 'd0000000-0000-0000-0000-00000000a102'
  and r.code = 'advertiser_owner'
on conflict do nothing;

insert into organization_members (organization_id, user_id, role_id, status)
select 'd0000000-0000-0000-0000-00000000f103', u.id, r.id, 'active'
from users u, roles r
where u.auth_subject = 'd0000000-0000-0000-0000-00000000a103'
  and r.code = 'publisher_owner'
on conflict do nothing;

select public.ensure_platform_clearing();

insert into financial_accounts (id, organization_id, type, currency, status) values
  ('d0000000-0000-0000-0000-00000000f201', 'd0000000-0000-0000-0000-00000000f102', 'advertiser_cash', 'USD', 'active'),
  ('d0000000-0000-0000-0000-00000000f202', 'd0000000-0000-0000-0000-00000000f103', 'publisher_receivable', 'USD', 'active')
on conflict (id) do nothing;

insert into verticals (id, code, name, description, active) values
  ('d0000000-0000-0000-0000-00000000b101', 'upgrade_home', 'Upgrade Home Services', 'Baseline vertical for rehearsal', true)
on conflict (id) do update
  set code = excluded.code,
      name = excluded.name,
      description = excluded.description,
      active = excluded.active;

insert into products (id, vertical_id, code, name, description, active) values
  ('d0000000-0000-0000-0000-00000000b102', 'd0000000-0000-0000-0000-00000000b101', 'upgrade_solar', 'Upgrade Solar', 'Baseline product for rehearsal', true)
on conflict (id) do update
  set vertical_id = excluded.vertical_id,
      code = excluded.code,
      name = excluded.name,
      description = excluded.description,
      active = excluded.active;

insert into publisher_sources (id, publisher_org_id, name, channel, domain, acquisition_method, status, quality_score)
values (
  'd0000000-0000-0000-0000-00000000b103',
  'd0000000-0000-0000-0000-00000000f103',
  'Upgrade Publisher Source',
  'web',
  'upgrade.example',
  'owned',
  'active',
  98.50
)
on conflict (id) do update
  set publisher_org_id = excluded.publisher_org_id,
      name = excluded.name,
      channel = excluded.channel,
      domain = excluded.domain,
      acquisition_method = excluded.acquisition_method,
      status = excluded.status,
      quality_score = excluded.quality_score;

insert into source_verticals (source_id, vertical_id, product_id, geography_json)
values (
  'd0000000-0000-0000-0000-00000000b103',
  'd0000000-0000-0000-0000-00000000b101',
  'd0000000-0000-0000-0000-00000000b102',
  '{"states":{"include":["CA"]}}'::jsonb
)
on conflict do nothing;

insert into consent_templates (id, source_id, version, language, disclosure_text, proof_method)
values (
  'd0000000-0000-0000-0000-00000000b104',
  'd0000000-0000-0000-0000-00000000b103',
  1,
  'en',
  'I agree to be contacted about upgrade offers.',
  'checkbox'
)
on conflict (id) do update
  set source_id = excluded.source_id,
      version = excluded.version,
      language = excluded.language,
      disclosure_text = excluded.disclosure_text,
      proof_method = excluded.proof_method;

insert into campaigns (
  id, advertiser_org_id, name, vertical_id, product_id, status, timezone,
  daily_budget_cents, monthly_budget_cents, daily_cap, hourly_cap, bid_type,
  base_bid_cents, exclusivity, current_version, version, targeting_json
) values (
  'd0000000-0000-0000-0000-00000000c101',
  'd0000000-0000-0000-0000-00000000f102',
  'Upgrade CA Solar Buy',
  'd0000000-0000-0000-0000-00000000b101',
  'd0000000-0000-0000-0000-00000000b102',
  'active',
  'America/Los_Angeles',
  100000,
  500000,
  20,
  5,
  'fixed',
  4500,
  false,
  1,
  1,
  '{"states":["CA"]}'::jsonb
)
on conflict (id) do update
  set advertiser_org_id = excluded.advertiser_org_id,
      name = excluded.name,
      vertical_id = excluded.vertical_id,
      product_id = excluded.product_id,
      status = excluded.status,
      timezone = excluded.timezone,
      daily_budget_cents = excluded.daily_budget_cents,
      monthly_budget_cents = excluded.monthly_budget_cents,
      daily_cap = excluded.daily_cap,
      hourly_cap = excluded.hourly_cap,
      bid_type = excluded.bid_type,
      base_bid_cents = excluded.base_bid_cents,
      exclusivity = excluded.exclusivity,
      current_version = excluded.current_version,
      version = excluded.version,
      targeting_json = excluded.targeting_json;

insert into campaign_versions (
  id, campaign_id, version, targeting_json, eligibility_json, schedule_json,
  cap_config_json, evidence_requirements_json
) values (
  'd0000000-0000-0000-0000-00000000c102',
  'd0000000-0000-0000-0000-00000000c101',
  1,
  '{"states":["CA"]}'::jsonb,
  '{"min_lead_age_minutes":30}'::jsonb,
  '{"days":["mon","tue","wed","thu","fri"]}'::jsonb,
  '{"daily_budget_cents":100000}'::jsonb,
  '{"consent":true}'::jsonb
)
on conflict (id) do update
  set campaign_id = excluded.campaign_id,
      version = excluded.version,
      targeting_json = excluded.targeting_json,
      eligibility_json = excluded.eligibility_json,
      schedule_json = excluded.schedule_json,
      cap_config_json = excluded.cap_config_json,
      evidence_requirements_json = excluded.evidence_requirements_json;

insert into campaign_endpoints (
  id, campaign_id, type, endpoint_url, mapping_version, timeout_ms, retry_policy_json, status
) values (
  'd0000000-0000-0000-0000-00000000c103',
  'd0000000-0000-0000-0000-00000000c101',
  'webhook',
  'http://127.0.0.1:4010/hook',
  'v1',
  10000,
  '{"max_attempts":3}'::jsonb,
  'active'
)
on conflict (id) do update
  set campaign_id = excluded.campaign_id,
      type = excluded.type,
      endpoint_url = excluded.endpoint_url,
      mapping_version = excluded.mapping_version,
      timeout_ms = excluded.timeout_ms,
      retry_policy_json = excluded.retry_policy_json,
      status = excluded.status;

insert into opportunities (
  id, public_transaction_id, publisher_org_id, source_id, vertical_id,
  product_id, external_submission_id, status, normalized_payload_encrypted,
  schema_version
) values (
  'd0000000-0000-0000-0000-00000000d101',
  'UPGRADE-QL-1',
  'd0000000-0000-0000-0000-00000000f103',
  'd0000000-0000-0000-0000-00000000b103',
  'd0000000-0000-0000-0000-00000000b101',
  'd0000000-0000-0000-0000-00000000b102',
  'UPGRADE-E2E-1',
  'eligible',
  decode('00', 'hex'),
  '1.0'
)
on conflict (id) do update
  set public_transaction_id = excluded.public_transaction_id,
      publisher_org_id = excluded.publisher_org_id,
      source_id = excluded.source_id,
      vertical_id = excluded.vertical_id,
      product_id = excluded.product_id,
      external_submission_id = excluded.external_submission_id,
      status = excluded.status,
      normalized_payload_encrypted = excluded.normalized_payload_encrypted,
      schema_version = excluded.schema_version;

insert into consent_evidence (
  id, opportunity_id, template_id, proof_provider, proof_hash, captured_at, evidence_json
) values (
  'd0000000-0000-0000-0000-00000000d102',
  'd0000000-0000-0000-0000-00000000d101',
  'd0000000-0000-0000-0000-00000000b104',
  'upgrade-ui',
  'upgrade-proof-hash',
  now(),
  '{"source":"baseline"}'::jsonb
)
on conflict (id) do update
  set opportunity_id = excluded.opportunity_id,
      template_id = excluded.template_id,
      proof_provider = excluded.proof_provider,
      proof_hash = excluded.proof_hash,
      captured_at = excluded.captured_at,
      evidence_json = excluded.evidence_json;

insert into validation_runs (id, opportunity_id, pipeline_version, status, composite_score, started_at, completed_at)
values (
  'd0000000-0000-0000-0000-00000000d103',
  'd0000000-0000-0000-0000-00000000d101',
  '1.0',
  'passed',
  97.50,
  now(),
  now()
)
on conflict (id) do update
  set opportunity_id = excluded.opportunity_id,
      pipeline_version = excluded.pipeline_version,
      status = excluded.status,
      composite_score = excluded.composite_score,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at;

insert into validation_results (
  id, validation_run_id, check_code, provider, outcome, score, reason_code, evidence_json, latency_ms
) values (
  'd0000000-0000-0000-0000-00000000d104',
  'd0000000-0000-0000-0000-00000000d103',
  'CONSENT_OK',
  'baseline',
  'pass',
  100.00,
  null,
  '{"ok":true}'::jsonb,
  12
)
on conflict (id) do update
  set validation_run_id = excluded.validation_run_id,
      check_code = excluded.check_code,
      provider = excluded.provider,
      outcome = excluded.outcome,
      score = excluded.score,
      reason_code = excluded.reason_code,
      evidence_json = excluded.evidence_json,
      latency_ms = excluded.latency_ms;

insert into auction_runs (
  id, opportunity_id, status, started_at, completed_at, winning_campaign_id,
  winning_bid_cents, decision_reason
) values (
  'd0000000-0000-0000-0000-00000000d105',
  'd0000000-0000-0000-0000-00000000d101',
  'completed',
  now(),
  now(),
  'd0000000-0000-0000-0000-00000000c101',
  4500,
  'baseline winner'
)
on conflict (id) do update
  set opportunity_id = excluded.opportunity_id,
      status = excluded.status,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at,
      winning_campaign_id = excluded.winning_campaign_id,
      winning_bid_cents = excluded.winning_bid_cents,
      decision_reason = excluded.decision_reason;

insert into auction_candidates (
  id, auction_run_id, campaign_id, eligible, bid_cents, rank, reason_codes_json, rule_snapshot_json
) values (
  'd0000000-0000-0000-0000-00000000d106',
  'd0000000-0000-0000-0000-00000000d105',
  'd0000000-0000-0000-0000-00000000c101',
  true,
  4500,
  1,
  '["baseline-match"]'::jsonb,
  '{"status":"eligible"}'::jsonb
)
on conflict (id) do update
  set auction_run_id = excluded.auction_run_id,
      campaign_id = excluded.campaign_id,
      eligible = excluded.eligible,
      bid_cents = excluded.bid_cents,
      rank = excluded.rank,
      reason_codes_json = excluded.reason_codes_json,
      rule_snapshot_json = excluded.rule_snapshot_json;

insert into deliveries (
  id, opportunity_id, auction_run_id, campaign_id, endpoint_id, attempt_number,
  status, request_id, request_snapshot_redacted, response_snapshot_redacted,
  response_code, response_reason_code, latency_ms, sent_at, acknowledged_at,
  accepted_at
) values (
  'd0000000-0000-0000-0000-00000000d103',
  'd0000000-0000-0000-0000-00000000d101',
  'd0000000-0000-0000-0000-00000000d105',
  'd0000000-0000-0000-0000-00000000c101',
  'd0000000-0000-0000-0000-00000000c103',
  1,
  'accepted',
  'upgrade-delivery-1',
  '{"redacted":true}'::jsonb,
  '{"accepted":true}'::jsonb,
  200,
  'OK',
  42,
  now(),
  now(),
  now()
)
on conflict (id) do update
  set opportunity_id = excluded.opportunity_id,
      auction_run_id = excluded.auction_run_id,
      campaign_id = excluded.campaign_id,
      endpoint_id = excluded.endpoint_id,
      attempt_number = excluded.attempt_number,
      status = excluded.status,
      request_id = excluded.request_id,
      request_snapshot_redacted = excluded.request_snapshot_redacted,
      response_snapshot_redacted = excluded.response_snapshot_redacted,
      response_code = excluded.response_code,
      response_reason_code = excluded.response_reason_code,
      latency_ms = excluded.latency_ms,
      sent_at = excluded.sent_at,
      acknowledged_at = excluded.acknowledged_at,
      accepted_at = excluded.accepted_at;
SQL

  psql -q -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
set search_path = public;
select id as buyer_user_id
from public.users
where auth_subject = 'd0000000-0000-0000-0000-00000000a102'
limit 1
\gset

select public.post_balanced_journal(
  'funding',
  'upgrade-rehearsal-funding',
  'Baseline advertiser funding',
  :'buyer_user_id',
  'd0000000-0000-0000-0000-00000000f201',
  (select id from public.financial_accounts where organization_id = 'd0000000-0000-0000-0000-00000000f101' and type = 'platform_cash' and currency = 'USD' limit 1),
  50000,
  'USD',
  'funding',
  'organization',
  'd0000000-0000-0000-0000-00000000f102'
);
SQL

psql -q -v ON_ERROR_STOP=1 -d "$DB" <<SQL
select transaction_id
from public.reserve_campaign_transaction(
  '$OPPORTUNITY_ID',
  '$PUBLISHER_ORG_ID',
  '$ADVERTISER_ORG_ID',
  '$CAMPAIGN_ID',
  4500,
  'upgrade-idem-1'
);
\gset
select public.finalize_campaign_transaction(:'transaction_id'::uuid, '$DELIVERY_ID', true, 'BUYER_ACCEPTED');
SQL
}

audit_delta() {
  log "MIGRATION SAFETY AUDIT"
  local file version
  while IFS= read -r file; do
    version="$(basename "$file" .sql)"
    version="${version%%_*}"
    if [[ "$version" < "$DELTA_START" ]]; then
      continue
    fi
    if [[ "$version" > "$DELTA_END" ]]; then
      break
    fi
    local flags=()
    grep -Eqi '\bdrop table\b|\bdrop column\b|\btruncate\b' "$file" && flags+=("DESTRUCTIVE")
    grep -Eqi '\binsert into\b.*\bselect\b|\bupdate\b|\bdelete\b' "$file" && flags+=("DATA_DEPENDENT")
    grep -Eqi '\balter table\b|\balter function\b|\balter type\b' "$file" && flags+=("ALTER")
    grep -Eqi '\bcreate table\b|\bcreate index\b|\bcreate policy\b|\bcreate trigger\b|\bcreate or replace function\b' "$file" && flags+=("ADDITIVE")
    grep -Eqi '\bsecurity definer\b' "$file" && flags+=("SECURITY DEFINER")
    grep -Eqi '\balter table .* enable row level security\b|\bcreate policy\b' "$file" && flags+=("RLS")
    grep -Eqi '\bgrant execute\b|\brevoke all\b' "$file" && flags+=("PRIVILEGE")
    local joined
    joined="$(printf '%s,' "${flags[@]:-}")"
    joined="${joined%,}"
    printf '%s | %s\n' "$(basename "$file")" "${joined:-UNCLASSIFIED}"
  done < <(printf '%s\n' "$ROOT"/supabase/migrations/*.sql | sort)
}

verify_new_objects() {
  psql -q -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
select
  to_regclass('public.vertical_schema_versions') is not null as vertical_schema_versions,
  to_regclass('public.vertical_fields') is not null as vertical_fields,
  to_regclass('public.offers') is not null as offers,
  to_regclass('public.offer_versions') is not null as offer_versions,
  to_regclass('public.campaign_dayparts') is not null as campaign_dayparts,
  to_regprocedure('public.publish_vertical_schema_version(uuid)') is not null as publish_vertical_schema_version,
  to_regprocedure('public.create_vertical_schema_draft(uuid,uuid,text)') is not null as create_vertical_schema_draft,
  to_regprocedure('public.publish_offer_version(uuid)') is not null as publish_offer_version,
  to_regprocedure('public.create_offer_draft(uuid,text)') is not null as create_offer_draft,
  to_regprocedure('public.campaign_is_in_daypart(uuid,timestamptz)') is not null as campaign_is_in_daypart,
  to_regprocedure('public.offer_active_campaign_counts()') is not null as offer_active_campaign_counts;
SQL
}

verify_postgrest_discovery() {
  local pid=""
  cleanup_postgrest() {
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      pid=""
    fi
    pkill -f "postgrest .*postgrest.conf" 2>/dev/null || true
    pkill -f "harness/gateway.mjs" 2>/dev/null || true
  }
  trap cleanup_postgrest EXIT

  if ! command -v node >/dev/null 2>&1; then
    log "Node.js is required for the PostgREST discovery probe"
    return 1
  fi
  if [[ ! -s "$ROOT/e2e/harness/jwks.json" || ! -s "$ROOT/e2e/harness/jwt-private.pem" ]]; then
    node "$ROOT/e2e/harness/generate-keys.mjs" >/dev/null
  fi

  psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "alter role authenticator login; grant anon, authenticated, service_role to authenticator;" >/dev/null

  "$PGRST_BIN" "$ROOT/e2e/harness/postgrest.conf" >"$PGRST_LOG" 2>&1 &
  pid=$!

  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null "http://127.0.0.1:3001/vertical_schema_versions?select=id&limit=0" \
      && curl -sf -o /dev/null "http://127.0.0.1:3001/offer_versions?select=id&limit=0" \
      && curl -sf -o /dev/null "http://127.0.0.1:3001/campaign_dayparts?select=id&limit=0"; then
      log "PostgREST discovery verified"
      return 0
    fi
    sleep 0.5
  done

  log "PostgREST probe failed; log tail:"
  tail -20 "$PGRST_LOG" >&2 || true
  return 1
}

verify_sql_tests() {
  local test_file
  for test_file in "$ROOT"/supabase/tests/*.sql; do
    log "SQL TEST $(basename "$test_file")"
    psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$test_file" >/dev/null
  done
}

bootstrap_database() {
  psql -q -v ON_ERROR_STOP=1 -d postgres <<SQL
drop database if exists ${DB};
create database ${DB};
SQL

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
  $fn$ select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid $fn$;
create or replace function auth.role() returns text language sql stable as
  $fn$ select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  ) $fn$;

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
}

main() {
  log "CURRENT_HEAD=$(git -C "$ROOT" rev-parse --short HEAD)"
  log "LIVE_MIGRATION_BOUNDARY=20260830030652_finalize_campaign_transaction"
  log "REPO_BOUNDARY_FILE=${LIVE_BOUNDARY_VERSION}_finalize_campaign_transaction.sql (repo equivalent)"
  log "DELTA_START=$DELTA_START"
  log "DELTA_END=$DELTA_END"
  log "DELTA_MIGRATION_COUNT=9"

  "$ROOT/scripts/start-postgres.sh"
  bootstrap_database

  apply_migrations_through "$LIVE_BOUNDARY_VERSION"
  seed_baseline_data

  local baseline
  baseline="$(capture_state)"
  log "BASELINE_STATE=$baseline"

  audit_delta
  apply_migrations_range "$DELTA_START" "$DELTA_END"

  psql -q -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;
SQL

  local after
  after="$(capture_state)"
  log "POST_DELTA_STATE=$after"
  assert_rows "state preservation" "$baseline"

  verify_new_objects
  verify_postgrest_discovery
  verify_sql_tests

  log "UPGRADE_REHEARSAL=PASS"
}

main "$@"
