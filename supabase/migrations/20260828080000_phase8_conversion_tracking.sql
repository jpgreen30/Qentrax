begin;

-- Canonical closed-loop conversion events. Analytics views are intentionally
-- deferred until their required delivery/transaction dimensions exist.
create table if not exists public.conversion_events (
  id uuid primary key default gen_random_uuid(),
  advertiser_org_id uuid not null references public.organizations(id),
  transaction_id uuid references public.transactions(id),
  external_event_id text not null,
  external_record_id text,
  event_type text not null,
  revenue_cents integer,
  commission_cents integer,
  currency char(3) not null default 'USD',
  product text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  source_method text not null default 'api',
  validation_status text not null default 'received',
  raw_payload_ref text,
  unique(advertiser_org_id, external_event_id)
);

create index if not exists conversion_events_txn_idx
  on public.conversion_events(transaction_id);

alter table public.conversion_events enable row level security;

create policy conversion_events_advertiser on public.conversion_events
  for all to authenticated
  using (public.is_organization_member(advertiser_org_id))
  with check (public.is_organization_member(advertiser_org_id));

commit;
