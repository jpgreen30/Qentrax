-- Publisher payout batches (Net-30 style approval workflow)

create table if not exists public.payout_batches (
  id uuid primary key default gen_random_uuid(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'approved', 'released', 'failed', 'cancelled')),
  total_cents bigint not null default 0 check (total_cents >= 0),
  currency char(3) not null default 'USD',
  item_count integer not null default 0,
  notes text,
  created_by uuid references public.users(id),
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  released_by uuid references public.users(id),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payout_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.payout_batches(id) on delete cascade,
  publisher_org_id uuid not null references public.organizations(id),
  transaction_id uuid not null references public.transactions(id),
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'pending'
    check (status in ('pending', 'included', 'paid', 'held', 'removed')),
  created_at timestamptz not null default now(),
  unique (transaction_id)
);

create index if not exists payout_batches_status_idx on public.payout_batches(status);
create index if not exists payout_items_batch_id_idx on public.payout_items(batch_id);
create index if not exists payout_items_publisher_org_id_idx on public.payout_items(publisher_org_id);

alter table public.payout_batches enable row level security;
alter table public.payout_items enable row level security;

-- Platform admin full access; publishers can read their own items
drop policy if exists payout_batches_admin_all on public.payout_batches;
create policy payout_batches_admin_all on public.payout_batches
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists payout_items_admin_all on public.payout_items;
create policy payout_items_admin_all on public.payout_items
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists payout_items_publisher_select on public.payout_items;
create policy payout_items_publisher_select on public.payout_items
  for select to authenticated
  using (public.is_organization_member(publisher_org_id));
