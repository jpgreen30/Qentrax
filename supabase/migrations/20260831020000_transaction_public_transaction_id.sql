begin;

-- Advertiser/publisher opportunity lists need the public QL-* label without a
-- second PostgREST select on opportunities. That join is RLS-sensitive and
-- previously left the UI falling back to an internal uuid prefix after a
-- successful ping/post/charge.

alter table public.transactions
  add column if not exists public_transaction_id text;

update public.transactions t
set public_transaction_id = o.public_transaction_id
from public.opportunities o
where o.id = t.opportunity_id
  and t.public_transaction_id is null;

create unique index if not exists transactions_public_txn_idx
  on public.transactions (public_transaction_id)
  where public_transaction_id is not null;

create or replace function public.transactions_copy_public_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.public_transaction_id is null then
    select o.public_transaction_id
      into new.public_transaction_id
    from public.opportunities o
    where o.id = new.opportunity_id;
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_copy_public_id on public.transactions;
create trigger transactions_copy_public_id
  before insert or update of opportunity_id on public.transactions
  for each row
  execute function public.transactions_copy_public_id();

comment on column public.transactions.public_transaction_id is
  'Copied from opportunities.public_transaction_id so workspace lists can render QL-* without an opportunities RLS join.';

commit;
