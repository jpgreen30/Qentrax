-- Campaign buyer endpoints + delivery attempts (HTTP post path)

create table if not exists public.campaign_endpoints (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  type text not null default 'http_post',
  endpoint_url text not null,
  credentials_secret_ref text,
  mapping_version text not null default 'v1',
  timeout_ms integer not null default 8000,
  retry_policy_json jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  last_tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_endpoints_campaign_id_idx
  on public.campaign_endpoints(campaign_id);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id),
  auction_run_id uuid,
  campaign_id uuid not null references public.campaigns(id),
  endpoint_id uuid references public.campaign_endpoints(id),
  attempt_number integer not null default 1,
  status text not null,
  request_id text,
  request_snapshot_redacted jsonb,
  response_snapshot_redacted jsonb,
  response_code integer,
  latency_ms integer,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists deliveries_opportunity_id_idx on public.deliveries(opportunity_id);
create index if not exists deliveries_campaign_id_idx on public.deliveries(campaign_id);

alter table public.campaign_endpoints enable row level security;
alter table public.deliveries enable row level security;

drop policy if exists campaign_endpoints_member_select on public.campaign_endpoints;
create policy campaign_endpoints_member_select on public.campaign_endpoints
  for select to authenticated
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and public.is_organization_member(c.advertiser_org_id)
    )
  );

drop policy if exists campaign_endpoints_member_insert on public.campaign_endpoints;
create policy campaign_endpoints_member_insert on public.campaign_endpoints
  for insert to authenticated
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and public.is_organization_member(c.advertiser_org_id)
    )
  );

drop policy if exists deliveries_member_select on public.deliveries;
create policy deliveries_member_select on public.deliveries
  for select to authenticated
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and public.is_organization_member(c.advertiser_org_id)
    )
    or exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and public.is_organization_member(o.publisher_org_id)
    )
  );

drop policy if exists deliveries_member_insert on public.deliveries;
create policy deliveries_member_insert on public.deliveries
  for insert to authenticated
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and public.is_organization_member(c.advertiser_org_id)
    )
  );
