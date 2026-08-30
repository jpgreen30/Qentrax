begin;

-- Canonical prerequisites recovered from the production schema during Gate A.
-- This migration is intentionally additive and idempotent: it creates schema
-- required by the versioned Qentrax v2 migrations without mutating live rows.

do $$ begin
  create type public.agreement_type as enum (
    'terms_of_service','privacy_policy','publisher_agreement',
    'advertiser_agreement','data_processing'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.campaign_status as enum (
    'draft','testing','pending_review','approved','active','paused',
    'exhausted','archived','rejected'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.bid_type as enum ('fixed','floor');
exception when duplicate_object then null; end $$;

create table if not exists public.organization_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  address_json jsonb not null default '{}',
  contacts_json jsonb not null default '{}',
  beneficial_owners_json jsonb not null default '[]',
  kyb_provider_ref text,
  kyb_status text not null default 'not_started',
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists organization_profiles_kyb_status_idx
  on public.organization_profiles(kyb_status);

create table if not exists public.agreements (
  id uuid primary key default gen_random_uuid(),
  type public.agreement_type not null,
  version text not null,
  effective_at timestamptz not null default now(),
  document_url text,
  body_summary text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(type, version)
);

create table if not exists public.agreement_acceptances (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements(id),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references public.users(id),
  accepted_at timestamptz not null default now(),
  ip_hash text,
  unique(agreement_id, organization_id)
);
create index if not exists agreement_acceptances_org_idx
  on public.agreement_acceptances(organization_id);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  advertiser_org_id uuid not null references public.organizations(id),
  name text not null,
  vertical_id uuid references public.verticals(id),
  product_id uuid references public.products(id),
  status public.campaign_status not null default 'draft',
  timezone text not null default 'America/Los_Angeles',
  starts_at timestamptz,
  ends_at timestamptz,
  daily_budget_cents integer check(daily_budget_cents is null or daily_budget_cents >= 0),
  monthly_budget_cents integer check(monthly_budget_cents is null or monthly_budget_cents >= 0),
  daily_cap integer check(daily_cap is null or daily_cap >= 0),
  hourly_cap integer check(hourly_cap is null or hourly_cap >= 0),
  bid_type public.bid_type not null default 'fixed',
  base_bid_cents integer not null default 0 check(base_bid_cents >= 0),
  exclusivity boolean not null default false,
  current_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check(version > 0),
  targeting_json jsonb not null default '{}'
);
create index if not exists campaigns_advertiser_idx on public.campaigns(advertiser_org_id);
create index if not exists campaigns_status_idx on public.campaigns(status);

create table if not exists public.campaign_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  version integer not null,
  targeting_json jsonb not null default '{}',
  eligibility_json jsonb not null default '{}',
  schedule_json jsonb not null default '{}',
  cap_config_json jsonb not null default '{}',
  evidence_requirements_json jsonb not null default '{}',
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique(campaign_id, version)
);

create table if not exists public.campaign_endpoints (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  type text not null default 'webhook',
  endpoint_url text not null,
  credentials_secret_ref text,
  mapping_version text not null default 'v1',
  timeout_ms integer not null default 5000,
  retry_policy_json jsonb not null default '{"max_attempts": 3}',
  status text not null default 'draft',
  last_tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  type text not null,
  currency char(3) not null default 'USD',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique(organization_id, type, currency)
);

create table if not exists public.journals (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null default 'posted',
  idempotency_key text not null unique,
  description text,
  created_by uuid references public.users(id),
  posted_at timestamptz not null default now()
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.journals(id),
  account_id uuid not null references public.financial_accounts(id),
  direction text not null check(direction in ('debit','credit')),
  amount_cents integer not null check(amount_cents > 0),
  currency char(3) not null default 'USD',
  entry_type text not null,
  reference_type text,
  reference_id uuid,
  occurred_at timestamptz not null default now()
);
create index if not exists ledger_entries_account_idx on public.ledger_entries(account_id);
create index if not exists ledger_entries_journal_idx on public.ledger_entries(journal_id);

create table if not exists public.campaign_daily_usage (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  usage_date date not null default (timezone('utc', now()))::date,
  reserved_cents integer not null default 0 check(reserved_cents >= 0),
  charged_cents integer not null default 0 check(charged_cents >= 0),
  accepted_count integer not null default 0,
  reservation_count integer not null default 0,
  primary key(campaign_id, usage_date)
);

alter table public.organization_profiles enable row level security;
alter table public.agreements enable row level security;
alter table public.agreement_acceptances enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_versions enable row level security;
alter table public.campaign_endpoints enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.journals enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.campaign_daily_usage enable row level security;

create policy organization_profiles_platform on public.organization_profiles
  for all to authenticated using (public.is_platform_admin())
  with check (public.is_platform_admin());
create policy organization_profiles_tenant_insert on public.organization_profiles
  for insert to authenticated with check (public.is_organization_member(organization_id));
create policy organization_profiles_tenant_select on public.organization_profiles
  for select to authenticated using (public.is_organization_member(organization_id));
create policy organization_profiles_tenant_update on public.organization_profiles
  for update to authenticated using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
create policy agreements_authenticated_select on public.agreements
  for select to authenticated using (active = true);
create policy agreement_acceptances_tenant_insert on public.agreement_acceptances
  for insert to authenticated with check (
    public.is_organization_member(organization_id)
    and user_id = public.current_app_user_id()
  );
create policy agreement_acceptances_tenant_select on public.agreement_acceptances
  for select to authenticated using (public.is_organization_member(organization_id));
create policy campaigns_tenant_all on public.campaigns
  for all to authenticated using (public.is_organization_member(advertiser_org_id))
  with check (public.is_organization_member(advertiser_org_id));
create policy campaign_versions_tenant on public.campaign_versions
  for all to authenticated using (
    exists (select 1 from public.campaigns c
      where c.id = campaign_id and public.is_organization_member(c.advertiser_org_id))
  ) with check (
    exists (select 1 from public.campaigns c
      where c.id = campaign_id and public.is_organization_member(c.advertiser_org_id))
  );
create policy campaign_endpoints_tenant on public.campaign_endpoints
  for all to authenticated using (
    exists (select 1 from public.campaigns c
      where c.id = campaign_id and public.is_organization_member(c.advertiser_org_id))
  ) with check (
    exists (select 1 from public.campaigns c
      where c.id = campaign_id and public.is_organization_member(c.advertiser_org_id))
  );
create policy financial_accounts_member_insert on public.financial_accounts
  for insert to authenticated with check (
    public.is_organization_member(organization_id) or public.is_platform_admin()
  );
create policy financial_accounts_tenant on public.financial_accounts
  for select to authenticated using (public.is_organization_member(organization_id));
create policy journals_no_direct on public.journals
  for select to authenticated using (false);
create policy ledger_entries_via_account on public.ledger_entries
  for select to authenticated using (
    exists (select 1 from public.financial_accounts a
      where a.id = account_id and public.is_organization_member(a.organization_id))
  );
create policy campaign_daily_usage_tenant on public.campaign_daily_usage
  for select to authenticated using (
    exists (select 1 from public.campaigns c
      where c.id = campaign_id and public.is_organization_member(c.advertiser_org_id))
  );


create or replace function public.ensure_platform_clearing() returns uuid
language plpgsql security definer set search_path = '' as $
declare v_org_id uuid; v_acct_id uuid;
begin
  select id into v_org_id from public.organizations where type = 'platform' limit 1;
  if v_org_id is null then
    insert into public.organizations (type, legal_name, onboarding_status, status)
    values ('platform', 'Qentrax Platform', 'approved', 'active')
    returning id into v_org_id;
  end if;
  select id into v_acct_id from public.financial_accounts
  where organization_id = v_org_id and type = 'platform_cash' and currency = 'USD';
  if v_acct_id is null then
    insert into public.financial_accounts (organization_id, type, currency, status)
    values (v_org_id, 'platform_cash', 'USD', 'active')
    returning id into v_acct_id;
  end if;
  return v_acct_id;
end $;

create or replace function public.post_balanced_journal(
  p_type text, p_idempotency_key text, p_description text, p_created_by uuid,
  p_debit_account_id uuid, p_credit_account_id uuid, p_amount_cents integer,
  p_currency char(3) default 'USD', p_entry_type text default 'funding',
  p_reference_type text default null, p_reference_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $
declare v_journal_id uuid;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'amount_cents must be positive';
  end if;
  if p_debit_account_id = p_credit_account_id then
    raise exception 'debit and credit accounts must differ';
  end if;
  insert into public.journals (type, status, idempotency_key, description, created_by)
  values (p_type, 'posted', p_idempotency_key, p_description, p_created_by)
  on conflict (idempotency_key) do update set description = excluded.description
  returning id into v_journal_id;
  if exists (select 1 from public.ledger_entries where journal_id = v_journal_id) then
    return v_journal_id;
  end if;
  insert into public.ledger_entries
    (journal_id, account_id, direction, amount_cents, currency, entry_type, reference_type, reference_id)
  values
    (v_journal_id, p_debit_account_id, 'debit', p_amount_cents, p_currency, p_entry_type, p_reference_type, p_reference_id),
    (v_journal_id, p_credit_account_id, 'credit', p_amount_cents, p_currency, p_entry_type, p_reference_type, p_reference_id);
  return v_journal_id;
end $;

revoke all on function public.ensure_platform_clearing() from public, anon, authenticated;
revoke all on function public.post_balanced_journal(text,text,text,uuid,uuid,uuid,integer,char,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.ensure_platform_clearing() to service_role;
grant execute on function public.post_balanced_journal(text,text,text,uuid,uuid,uuid,integer,char,text,text,uuid)
  to service_role;

commit;
