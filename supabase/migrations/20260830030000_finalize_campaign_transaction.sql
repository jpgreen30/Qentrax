begin;

create or replace function public.finalize_campaign_transaction(
  p_transaction_id uuid,
  p_delivery_id uuid,
  p_accepted boolean,
  p_reason_code text default null
) returns table (
  transaction_id uuid,
  transaction_status text,
  changed boolean,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_transaction public.transactions%rowtype;
  v_today date;
begin
  select t.* into v_transaction
  from public.transactions t
  where t.id = p_transaction_id
  for update;

  if not found then
    return query select null::uuid, null::text, false, 'TRANSACTION_NOT_FOUND'::text;
    return;
  end if;

  if v_transaction.status in ('charged', 'settled') then
    return query select v_transaction.id, v_transaction.status, false, null::text;
    return;
  end if;

  if v_transaction.status = 'returned' then
    return query select v_transaction.id, v_transaction.status, false, 'TRANSACTION_ALREADY_RELEASED'::text;
    return;
  end if;

  if v_transaction.status <> 'reserved' then
    return query select v_transaction.id, v_transaction.status, false, 'INVALID_TRANSACTION_STATE'::text;
    return;
  end if;

  v_today := (pg_catalog.timezone('utc', v_transaction.created_at))::date;

  if p_accepted then
    update public.campaign_daily_usage u
    set reserved_cents = pg_catalog.greatest(0, u.reserved_cents - v_transaction.advertiser_price_cents),
        charged_cents = u.charged_cents + v_transaction.advertiser_price_cents,
        reservation_count = pg_catalog.greatest(0, u.reservation_count - 1),
        accepted_count = u.accepted_count + 1
    where u.campaign_id = v_transaction.campaign_id
      and u.usage_date = v_today;

    update public.transactions
    set status = 'charged',
        delivery_id = p_delivery_id,
        accepted_at = pg_catalog.now(),
        billable_at = pg_catalog.now(),
        updated_at = pg_catalog.now(),
        version = version + 1
    where id = v_transaction.id;

    insert into public.transaction_events (
      transaction_id, event_type, reason_code, actor_type, payload_json, occurred_at
    ) values (
      v_transaction.id, 'charged', pg_catalog.coalesce(p_reason_code, 'BUYER_ACCEPTED'),
      'system', pg_catalog.jsonb_build_object('delivery_id', p_delivery_id), pg_catalog.now()
    );

    return query select v_transaction.id, 'charged'::text, true, null::text;
  else
    update public.campaign_daily_usage u
    set reserved_cents = pg_catalog.greatest(0, u.reserved_cents - v_transaction.advertiser_price_cents),
        reservation_count = pg_catalog.greatest(0, u.reservation_count - 1)
    where u.campaign_id = v_transaction.campaign_id
      and u.usage_date = v_today;

    update public.transactions
    set status = 'returned',
        delivery_id = p_delivery_id,
        updated_at = pg_catalog.now(),
        version = version + 1
    where id = v_transaction.id;

    insert into public.transaction_events (
      transaction_id, event_type, reason_code, actor_type, payload_json, occurred_at
    ) values (
      v_transaction.id, 'error', pg_catalog.coalesce(p_reason_code, 'DELIVERY_FAILED'),
      'system', pg_catalog.jsonb_build_object('delivery_id', p_delivery_id, 'reservation_released', true),
      pg_catalog.now()
    );

    return query select v_transaction.id, 'returned'::text, true, null::text;
  end if;
end;
$function$;

revoke all on function public.finalize_campaign_transaction(uuid,uuid,boolean,text)
  from public, anon, authenticated;
grant execute on function public.finalize_campaign_transaction(uuid,uuid,boolean,text)
  to service_role;

commit;
