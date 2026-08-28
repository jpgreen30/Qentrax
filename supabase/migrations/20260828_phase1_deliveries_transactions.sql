begin;

-- Delivery attempt to advertiser endpoint
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id),
  auction_run_id uuid not null references public.auction_runs(id),
  campaign_id uuid not null references public.campaigns(id),
  endpoint_id uuid references public.campaign_endpoints(id),
  attempt_number integer not null default 1 check(attempt_number > 0),
  status text not null default 'pending' check(status in ('pending', 'sent', 'acknowledged', 'accepted', 'rejected', 'timed_out', 'failed')),
  request_id text not null unique,
  request_snapshot_redacted jsonb,
  response_snapshot_redacted jsonb,
  response_code integer,
  response_reason_code text,
  latency_ms integer,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check(version > 0)
);

-- Financial transaction: opportunity charge + payout pair
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade unique,
  publisher_org_id uuid not null references public.organizations(id),
  advertiser_org_id uuid not null references public.organizations(id),
  campaign_id uuid not null references public.campaigns(id),
  delivery_id uuid references public.deliveries(id),
  status text not null default 'pending' check(status in ('pending', 'reserved', 'charged', 'returned', 'settled')),
  advertiser_price_cents integer not null check(advertiser_price_cents >= 0),
  publisher_amount_cents integer not null check(publisher_amount_cents >= 0),
  platform_margin_cents integer not null check(platform_margin_cents >= 0),
  currency text not null default 'USD',
  idempotency_key text not null unique,
  reserved_at timestamptz,
  accepted_at timestamptz,
  billable_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check(version > 0)
);

-- Immutable event log for transaction state changes
create table if not exists public.transaction_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id),
  event_type text not null check(event_type in ('created', 'reserved', 'charged', 'returned', 'settled', 'error')),
  reason_code text,
  actor_type text not null check(actor_type in ('system', 'user', 'api')),
  actor_id uuid references public.users(id),
  payload_json jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Prevent transaction_events mutation
create or replace function public.prevent_transaction_events_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'transaction_events are append-only';
end $$;

create trigger transaction_events_immutable before update or delete on public.transaction_events
for each row execute function public.prevent_transaction_events_mutation();

create index deliveries_opportunity_idx on public.deliveries(opportunity_id);
create index deliveries_campaign_idx on public.deliveries(campaign_id);
create index deliveries_status_idx on public.deliveries(status);
create index deliveries_request_id_idx on public.deliveries(request_id);
create index transactions_opportunity_idx on public.transactions(opportunity_id);
create index transactions_publisher_org_idx on public.transactions(publisher_org_id);
create index transactions_advertiser_org_idx on public.transactions(advertiser_org_id);
create index transactions_campaign_idx on public.transactions(campaign_id);
create index transactions_status_idx on public.transactions(status);
create index transactions_idempotency_idx on public.transactions(idempotency_key);
create index transaction_events_transaction_idx on public.transaction_events(transaction_id);
create index transaction_events_type_idx on public.transaction_events(event_type);

-- RLS: publisher sees their own deliveries; advertiser sees theirs; platform admin sees all
alter table public.deliveries enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_events enable row level security;

create policy deliveries_publisher_select on public.deliveries for select to authenticated
  using (opportunity_id in (select id from public.opportunities where publisher_org_id = public.org_id_from_auth()));

create policy deliveries_advertiser_select on public.deliveries for select to authenticated
  using (campaign_id in (select id from public.campaigns where advertiser_org_id = public.org_id_from_auth()));

create policy transactions_publisher_select on public.transactions for select to authenticated
  using (publisher_org_id = public.org_id_from_auth());

create policy transactions_advertiser_select on public.transactions for select to authenticated
  using (advertiser_org_id = public.org_id_from_auth());

create policy transaction_events_publisher_select on public.transaction_events for select to authenticated
  using (transaction_id in (select id from public.transactions where publisher_org_id = public.org_id_from_auth()));

create policy transaction_events_advertiser_select on public.transaction_events for select to authenticated
  using (transaction_id in (select id from public.transactions where advertiser_org_id = public.org_id_from_auth()));

commit;
