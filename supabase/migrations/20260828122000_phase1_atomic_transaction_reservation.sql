begin;

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
  v_today date := (pg_catalog.timezone('utc', pg_catalog.now()))::date;
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
      and t.created_at >= pg_catalog.date_trunc('hour', pg_catalog.now());

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

revoke all on function public.reserve_campaign_transaction(uuid,uuid,uuid,uuid,integer,text)
  from public, anon, authenticated;
grant execute on function public.reserve_campaign_transaction(uuid,uuid,uuid,uuid,integer,text)
  to service_role;

commit;
