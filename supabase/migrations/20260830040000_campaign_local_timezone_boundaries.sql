begin;

-- Cap and budget boundaries must reset at the campaign's local midnight, not UTC
-- midnight. campaigns.timezone already carries the intended zone (default
-- America/Los_Angeles); both the reservation and the finalizer previously derived
-- the campaign_daily_usage bucket from UTC, so a Pacific campaign rolled its daily
-- cap at 16:00/17:00 local. Both functions are updated together because they must
-- agree on which usage row a reservation increments and later releases.

create or replace function public.campaign_usage_date(
  p_timezone text,
  p_at timestamptz
) returns date
language sql
immutable
set search_path = ''
as $function$
  select (pg_catalog.timezone(
    coalesce(nullif(pg_catalog.btrim(p_timezone), ''), 'UTC'),
    p_at
  ))::date;
$function$;

create or replace function public.reserve_campaign_transaction(
  p_opportunity_id uuid,
  p_publisher_org_id uuid,
  p_advertiser_org_id uuid,
  p_campaign_id uuid,
  p_price_cents integer,
  p_idempotency_key text
) returns table (
  transaction_id uuid,
  transaction_status text,
  charge_cents integer,
  created boolean,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign public.campaigns%rowtype;
  v_existing public.transactions%rowtype;
  v_usage public.campaign_daily_usage%rowtype;
  v_transaction public.transactions%rowtype;
  v_hourly_count integer;
  v_publisher_cents integer;
  v_tz text;
  v_today date;
  v_hour_start timestamptz;
begin
  if p_price_cents is null or p_price_cents <= 0 then
    return query select null::uuid, null::text, null::integer, false, 'INVALID_PRICE'::text;
    return;
  end if;

  if p_idempotency_key is null or pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) = 0 then
    return query select null::uuid, null::text, null::integer, false, 'INVALID_IDEMPOTENCY_KEY'::text;
    return;
  end if;

  select t.* into v_existing
  from public.transactions t
  where t.opportunity_id = p_opportunity_id
     or t.idempotency_key = p_idempotency_key
  order by (t.opportunity_id = p_opportunity_id) desc
  limit 1;

  if found then
    return query select
      v_existing.id,
      v_existing.status,
      v_existing.advertiser_price_cents,
      false,
      null::text;
    return;
  end if;

  select c.* into v_campaign
  from public.campaigns c
  where c.id = p_campaign_id
  for update;

  if not found then
    return query select null::uuid, null::text, null::integer, false, 'CAMPAIGN_NOT_FOUND'::text;
    return;
  end if;

  if v_campaign.advertiser_org_id <> p_advertiser_org_id then
    return query select null::uuid, null::text, null::integer, false, 'CAMPAIGN_ORG_MISMATCH'::text;
    return;
  end if;

  if v_campaign.status <> 'active' then
    return query select null::uuid, null::text, null::integer, false, 'CAMPAIGN_NOT_ACTIVE'::text;
    return;
  end if;

  -- Campaign-local boundaries. timezone(tz, timestamptz) yields local wall time;
  -- truncating there and converting back keeps the hour boundary correct across
  -- DST transitions instead of drifting with the UTC offset.
  v_tz := coalesce(nullif(pg_catalog.btrim(v_campaign.timezone), ''), 'UTC');
  v_today := public.campaign_usage_date(v_tz, pg_catalog.now());
  v_hour_start := pg_catalog.timezone(
    v_tz,
    pg_catalog.date_trunc('hour', pg_catalog.timezone(v_tz, pg_catalog.now()))
  );

  insert into public.campaign_daily_usage (campaign_id, usage_date)
  values (p_campaign_id, v_today)
  on conflict (campaign_id, usage_date) do nothing;

  select u.* into v_usage
  from public.campaign_daily_usage u
  where u.campaign_id = p_campaign_id and u.usage_date = v_today
  for update;

  if v_campaign.daily_budget_cents is not null
     and v_usage.reserved_cents + v_usage.charged_cents + p_price_cents > v_campaign.daily_budget_cents then
    return query select null::uuid, null::text, null::integer, false, 'DAILY_BUDGET_REACHED'::text;
    return;
  end if;

  if v_campaign.daily_cap is not null
     and v_usage.reservation_count + v_usage.accepted_count >= v_campaign.daily_cap then
    return query select null::uuid, null::text, null::integer, false, 'DAILY_CAP_REACHED'::text;
    return;
  end if;

  if v_campaign.hourly_cap is not null then
    select pg_catalog.count(*)::integer into v_hourly_count
    from public.transactions t
    where t.campaign_id = p_campaign_id
      and t.status in ('reserved', 'charged')
      and t.created_at >= v_hour_start;

    if v_hourly_count >= v_campaign.hourly_cap then
      return query select null::uuid, null::text, null::integer, false, 'HOURLY_CAP_REACHED'::text;
      return;
    end if;
  end if;

  v_publisher_cents := pg_catalog.floor(p_price_cents * 0.85)::integer;

  insert into public.transactions (
    opportunity_id,
    publisher_org_id,
    advertiser_org_id,
    campaign_id,
    status,
    advertiser_price_cents,
    publisher_amount_cents,
    platform_margin_cents,
    currency,
    idempotency_key,
    reserved_at
  ) values (
    p_opportunity_id,
    p_publisher_org_id,
    p_advertiser_org_id,
    p_campaign_id,
    'reserved',
    p_price_cents,
    v_publisher_cents,
    p_price_cents - v_publisher_cents,
    'USD',
    p_idempotency_key,
    pg_catalog.now()
  )
  returning * into v_transaction;

  update public.campaign_daily_usage u
  set reserved_cents = u.reserved_cents + p_price_cents,
      reservation_count = u.reservation_count + 1
  where u.campaign_id = p_campaign_id and u.usage_date = v_today;

  return query select
    v_transaction.id,
    v_transaction.status,
    v_transaction.advertiser_price_cents,
    true,
    null::text;
exception
  when unique_violation then
    select t.* into v_existing
    from public.transactions t
    where t.opportunity_id = p_opportunity_id
       or t.idempotency_key = p_idempotency_key
    limit 1;

    if found then
      return query select
        v_existing.id,
        v_existing.status,
        v_existing.advertiser_price_cents,
        false,
        null::text;
      return;
    end if;
    raise;
end;
$function$;

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
  v_tz text;
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

  -- Resolve the same campaign-local bucket the reservation incremented, so the
  -- release lands on the row that holds the reservation.
  select coalesce(nullif(pg_catalog.btrim(c.timezone), ''), 'UTC')
  into v_tz
  from public.campaigns c
  where c.id = v_transaction.campaign_id;

  v_today := public.campaign_usage_date(coalesce(v_tz, 'UTC'), v_transaction.created_at);

  if p_accepted then
    update public.campaign_daily_usage u
    set reserved_cents = greatest(0, u.reserved_cents - v_transaction.advertiser_price_cents),
        charged_cents = u.charged_cents + v_transaction.advertiser_price_cents,
        reservation_count = greatest(0, u.reservation_count - 1),
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
      v_transaction.id, 'charged', null,
      'system', pg_catalog.jsonb_build_object('delivery_id', p_delivery_id, 'reason_code', coalesce(p_reason_code, 'BUYER_ACCEPTED')), pg_catalog.now()
    );

    return query select v_transaction.id, 'charged'::text, true, null::text;
  else
    update public.campaign_daily_usage u
    set reserved_cents = greatest(0, u.reserved_cents - v_transaction.advertiser_price_cents),
        reservation_count = greatest(0, u.reservation_count - 1)
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
      v_transaction.id, 'error', null,
      'system', pg_catalog.jsonb_build_object('delivery_id', p_delivery_id, 'reservation_released', true, 'reason_code', coalesce(p_reason_code, 'DELIVERY_FAILED')),
      pg_catalog.now()
    );

    return query select v_transaction.id, 'returned'::text, true, null::text;
  end if;
end;
$function$;

revoke all on function public.campaign_usage_date(text, timestamptz) from public, anon, authenticated;
grant execute on function public.campaign_usage_date(text, timestamptz) to service_role;

revoke all on function public.reserve_campaign_transaction(uuid,uuid,uuid,uuid,integer,text)
  from public, anon, authenticated;
grant execute on function public.reserve_campaign_transaction(uuid,uuid,uuid,uuid,integer,text)
  to service_role;

revoke all on function public.finalize_campaign_transaction(uuid,uuid,boolean,text)
  from public, anon, authenticated;
grant execute on function public.finalize_campaign_transaction(uuid,uuid,boolean,text)
  to service_role;

commit;
