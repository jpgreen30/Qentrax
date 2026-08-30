-- Phase 7: delivery retry / SLA columns
-- Applied live via Supabase MCP; kept for env parity.

alter table public.deliveries
  add column if not exists transaction_id uuid,
  add column if not exists endpoint_url text,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists last_error text,
  add column if not exists sla_due_at timestamptz,
  add column if not exists delivery_mode text;

create index if not exists deliveries_retry_due_idx
  on public.deliveries (next_attempt_at)
  where next_attempt_at is not null
    and status in ('rejected', 'timed_out', 'failed', 'acknowledged');

create index if not exists deliveries_opportunity_attempt_idx
  on public.deliveries (opportunity_id, attempt_number desc);
