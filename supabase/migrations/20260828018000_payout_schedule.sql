-- Automated payout schedule configuration (singleton)

create table if not exists public.payout_schedule_config (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  cadence text not null default 'weekly'
    check (cadence in ('daily', 'weekly', 'biweekly', 'monthly')),
  net_days integer not null default 30 check (net_days >= 0 and net_days <= 365),
  min_batch_cents bigint not null default 0 check (min_batch_cents >= 0),
  auto_approve boolean not null default false,
  timezone text not null default 'UTC',
  last_run_at timestamptz,
  last_run_status text,
  last_run_batch_id uuid references public.payout_batches(id),
  last_run_message text,
  next_run_at timestamptz,
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.payout_schedule_config (id, enabled, cadence, net_days, min_batch_cents, auto_approve)
values (1, false, 'weekly', 30, 0, false)
on conflict (id) do nothing;

alter table public.payout_schedule_config enable row level security;

drop policy if exists payout_schedule_admin_all on public.payout_schedule_config;
create policy payout_schedule_admin_all on public.payout_schedule_config
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
