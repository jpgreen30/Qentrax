-- Phase 4: Delivery Execution Engine
-- Enhanced deliveries table with retry tracking, SLA, and audit

-- Extend existing deliveries table with retry policy
alter table if exists public.deliveries
add column if not exists delivery_type text default 'native', -- native or external
add column if not exists delivery_target_id uuid, -- campaign_id or connector_id
add column if not exists attempt_number int default 1,
add column if not exists next_attempt_at timestamp with time zone,
add column if not exists max_attempts int default 5,
add column if not exists sla_due_at timestamp with time zone,
add column if not exists sla_minutes int default 30;

-- Create return requests table for handling delivery rejections
create table if not exists public.return_requests (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  delivery_id uuid references public.deliveries(id) on delete set null,
  reason_code text not null, -- DELIVERY_FAILED, ADVERTISER_REJECT, QUALITY_ISSUE, etc.
  reason_text text,
  requested_by_org_id uuid not null, -- Publisher or Advertiser requesting return
  refund_cents int,
  status text not null default 'pending', -- pending, approved, rejected, reversed
  rejected_reason text,
  created_at timestamp with time zone not null default now(),
  approved_at timestamp with time zone,
  reversed_at timestamp with time zone,
  primary key (id)
);

create index idx_return_request_transaction on public.return_requests(transaction_id);
create index idx_return_request_status on public.return_requests(status);
create index idx_return_request_org on public.return_requests(organization_id);

-- Create reversal ledger entries
create table if not exists public.reversal_entries (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  return_request_id uuid not null references public.return_requests(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  entry_type text not null, -- ADVERTISER_REFUND, PUBLISHER_CHARGEBACK, PLATFORM_LOSS
  amount_cents int not null,
  description text,
  status text not null default 'pending', -- pending, completed, failed
  created_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone,
  primary key (id)
);

create index idx_reversal_entry_transaction on public.reversal_entries(transaction_id);
create index idx_reversal_entry_return_request on public.reversal_entries(return_request_id);

-- RLS Policies for return_requests
create policy "organizations can view their own return_requests"
  on public.return_requests for select
  using (
    organization_id = public.org_id_from_auth()
  );

create policy "organizations can manage their own return_requests"
  on public.return_requests for all
  using (
    organization_id = public.org_id_from_auth()
  )
  with check (
    organization_id = public.org_id_from_auth()
  );

-- RLS Policies for reversal_entries
create policy "organizations can view their own reversal_entries"
  on public.reversal_entries for select
  using (
    organization_id = public.org_id_from_auth()
  );

create policy "reversal_entries are system-managed"
  on public.reversal_entries for all
  using (
    organization_id = public.org_id_from_auth()
  )
  with check (
    organization_id = public.org_id_from_auth()
  );

-- Enable RLS
alter table public.return_requests enable row level security;
alter table public.reversal_entries enable row level security;

-- Delivery attempt trigger for updating attempt count
create or replace function public.handle_delivery_attempt()
returns trigger as $$
begin
  -- Set SLA due time if not already set
  if new.sla_due_at is null then
    new.sla_due_at = new.created_at + interval '1 minute' * new.sla_minutes;
  end if;

  -- Calculate next attempt time if retry needed
  if new.status = 'pending' and new.next_attempt_at is null then
    new.next_attempt_at = new.created_at + interval '30 seconds' * (4 ^ (new.attempt_number - 1));
  end if;

  return new;
end;
$$ language plpgsql;

create trigger delivery_attempt_handler
  before insert on public.deliveries
  for each row
  execute function public.handle_delivery_attempt();

-- View for delivery retry queue (returns next batch to retry)
create or replace view public.delivery_retry_queue as
select
  d.id,
  d.transaction_id,
  d.opportunity_id,
  d.organization_id,
  d.delivery_type,
  d.delivery_target_id,
  d.attempt_number,
  d.next_attempt_at,
  d.sla_due_at,
  (now() > d.sla_due_at) as is_sla_breached,
  d.lead_data
from public.deliveries d
where d.status = 'pending'
  and d.next_attempt_at <= now()
  and d.attempt_number < d.max_attempts
order by d.next_attempt_at asc;
