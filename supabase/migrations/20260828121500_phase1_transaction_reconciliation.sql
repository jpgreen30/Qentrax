begin;

alter table public.transactions
  add column if not exists idempotency_key text,
  add column if not exists reserved_at timestamptz,
  add column if not exists version integer not null default 1;

update public.transactions
set idempotency_key = 'legacy:' || id::text
where idempotency_key is null or pg_catalog.length(pg_catalog.btrim(idempotency_key)) = 0;

alter table public.transactions
  alter column idempotency_key set not null;

create unique index if not exists transactions_idempotency_key_uidx
  on public.transactions(idempotency_key);

create index if not exists transactions_created_at_idx
  on public.transactions(created_at);

commit;
