begin;

alter table public.campaigns
  add column if not exists routing_weight integer not null default 100
    check (routing_weight > 0),
  add column if not exists routing_priority integer not null default 100
    check (routing_priority >= 0);

create table if not exists public.routing_allocation_state (
  scope_key text not null,
  strategy text not null check (strategy in ('round_robin','weighted_round_robin')),
  cursor bigint not null default 0 check (cursor >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope_key, strategy)
);

alter table public.routing_allocation_state enable row level security;

create or replace function public.next_routing_position(
  p_scope_key text,
  p_strategy text
) returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_position bigint;
begin
  if p_scope_key is null or length(trim(p_scope_key)) = 0 then
    raise exception 'scope key is required';
  end if;
  if p_strategy not in ('round_robin','weighted_round_robin') then
    raise exception 'unsupported allocation strategy';
  end if;

  insert into public.routing_allocation_state(scope_key, strategy, cursor)
  values (p_scope_key, p_strategy, 1)
  on conflict (scope_key, strategy)
  do update set cursor = public.routing_allocation_state.cursor + 1,
                updated_at = now()
  returning cursor - 1 into v_position;

  return v_position;
end;
$function$;

revoke all on table public.routing_allocation_state from public, anon, authenticated;
revoke all on function public.next_routing_position(text,text) from public, anon, authenticated;
grant select, insert, update on table public.routing_allocation_state to service_role;
grant execute on function public.next_routing_position(text,text) to service_role;

commit;
