begin;

-- Phase 4/5: bind a campaign to the offer it buys against, add the monthly cap
-- the checklist requires alongside the existing hourly and daily caps, and add
-- day-of-week / daypart scheduling.
--
-- Campaigns previously had no link to an Offer at all, so there was no way to
-- express "this advertiser is buying against these published terms", and no
-- schedule, so a campaign ran every hour of every day regardless of intent.

alter table public.campaigns
  add column offer_id uuid references public.offers(id),
  -- The exact offer version bought against. Frozen at activation so a later
  -- reprice does not silently change what this campaign agreed to.
  add column offer_version_id uuid references public.offer_versions(id),
  add column monthly_cap integer check (monthly_cap is null or monthly_cap >= 0),
  -- Pacing across the day. EVEN spreads the daily cap; ASAP spends as fast as
  -- demand allows.
  add column pacing text not null default 'ASAP'
    check (pacing in ('EVEN', 'ASAP'));

create index campaigns_offer_idx on public.campaigns (offer_id) where offer_id is not null;

-- One row per active window. A campaign with no rows runs at all hours, which
-- preserves the behaviour of every campaign that exists today.
create table public.campaign_dayparts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  -- ISO-8601 numbering: 1 = Monday through 7 = Sunday.
  day_of_week smallint not null check (day_of_week between 1 and 7),
  -- Minutes from local midnight. end_minute is exclusive, so 09:00-17:00 is
  -- 540..1020 and a window ending at midnight is 1440.
  start_minute integer not null check (start_minute >= 0 and start_minute < 1440),
  end_minute integer not null check (end_minute > 0 and end_minute <= 1440),
  created_at timestamptz not null default now(),
  constraint daypart_window_ordered check (start_minute < end_minute),
  -- Multiple windows per day are allowed; identical ones are not.
  unique (campaign_id, day_of_week, start_minute, end_minute)
);

create index campaign_dayparts_campaign_idx
  on public.campaign_dayparts (campaign_id, day_of_week);

alter table public.campaign_dayparts enable row level security;

create policy campaign_dayparts_tenant_select on public.campaign_dayparts
  for select to authenticated
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.advertiser_org_id = public.org_id_from_auth()
    )
    or public.is_platform_admin()
  );

create policy campaign_dayparts_tenant_write on public.campaign_dayparts
  for all to authenticated
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.advertiser_org_id = public.org_id_from_auth()
    )
  )
  with check (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.advertiser_org_id = public.org_id_from_auth()
    )
  );

---------------------------------------------------------------------------
-- Schedule evaluation, in the campaign's own timezone.
---------------------------------------------------------------------------

create or replace function public.campaign_is_in_daypart(
  p_campaign_id uuid,
  p_at timestamptz default now()
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tz text;
  v_local timestamp;
  v_dow smallint;
  v_minute integer;
  v_has_windows boolean;
begin
  select coalesce(nullif(pg_catalog.btrim(c.timezone), ''), 'UTC')
    into v_tz
  from public.campaigns c where c.id = p_campaign_id;

  if v_tz is null then
    return false; -- unknown campaign
  end if;

  select exists (select 1 from public.campaign_dayparts where campaign_id = p_campaign_id)
    into v_has_windows;

  -- No configured windows means "always on", which is how existing campaigns
  -- behaved before scheduling existed.
  if not v_has_windows then
    return true;
  end if;

  v_local := pg_catalog.timezone(v_tz, p_at);
  -- date_part('isodow') gives 1=Monday..7=Sunday, matching day_of_week.
  -- extract(... from ...) is SQL syntax rather than a schema-qualifiable
  -- function, so date_part is used under the empty search_path.
  v_dow := pg_catalog.date_part('isodow', v_local)::smallint;
  v_minute := (pg_catalog.date_part('hour', v_local) * 60
               + pg_catalog.date_part('minute', v_local))::integer;

  return exists (
    select 1 from public.campaign_dayparts d
    where d.campaign_id = p_campaign_id
      and d.day_of_week = v_dow
      and v_minute >= d.start_minute
      and v_minute < d.end_minute
  );
end;
$function$;

revoke all on function public.campaign_is_in_daypart(uuid, timestamptz) from public;
grant execute on function public.campaign_is_in_daypart(uuid, timestamptz)
  to authenticated, service_role;

---------------------------------------------------------------------------
-- Enforce the schedule and the monthly cap inside the atomic reservation, so a
-- campaign outside its daypart cannot be sold to even under concurrency.
---------------------------------------------------------------------------

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
  v_monthly_count integer;
  v_monthly_spend integer;
  v_publisher_cents integer;
  v_tz text;
  v_today date;
  v_month_start date;
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
      v_existing.id, v_existing.status, v_existing.advertiser_price_cents, false, null::text;
    return;
  end if;

  select c.* into v_campaign
  from public.campaigns c where c.id = p_campaign_id for update;

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

  -- Campaign-local boundaries. Truncating in local wall time and converting
  -- back keeps the hour boundary correct across DST transitions.
  v_tz := coalesce(nullif(pg_catalog.btrim(v_campaign.timezone), ''), 'UTC');
  v_today := public.campaign_usage_date(v_tz, pg_catalog.now());
  v_month_start := pg_catalog.date_trunc('month', v_today)::date;
  v_hour_start := pg_catalog.timezone(
    v_tz, pg_catalog.date_trunc('hour', pg_catalog.timezone(v_tz, pg_catalog.now()))
  );

  if not public.campaign_is_in_daypart(p_campaign_id, pg_catalog.now()) then
    return query select null::uuid, null::text, null::integer, false, 'OUTSIDE_DAYPART'::text;
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

  -- Monthly figures aggregate the daily usage rows, which are already keyed by
  -- the campaign-local day, so the month boundary is campaign-local too.
  if v_campaign.monthly_cap is not null then
    select coalesce(sum(u.reservation_count + u.accepted_count), 0)::integer
      into v_monthly_count
    from public.campaign_daily_usage u
    where u.campaign_id = p_campaign_id and u.usage_date >= v_month_start;

    if v_monthly_count >= v_campaign.monthly_cap then
      return query select null::uuid, null::text, null::integer, false, 'MONTHLY_CAP_REACHED'::text;
      return;
    end if;
  end if;

  if v_campaign.monthly_budget_cents is not null then
    select coalesce(sum(u.reserved_cents + u.charged_cents), 0)::integer
      into v_monthly_spend
    from public.campaign_daily_usage u
    where u.campaign_id = p_campaign_id and u.usage_date >= v_month_start;

    if v_monthly_spend + p_price_cents > v_campaign.monthly_budget_cents then
      return query select null::uuid, null::text, null::integer, false, 'MONTHLY_BUDGET_REACHED'::text;
      return;
    end if;
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
    opportunity_id, publisher_org_id, advertiser_org_id, campaign_id, status,
    advertiser_price_cents, publisher_amount_cents, platform_margin_cents,
    currency, idempotency_key, reserved_at
  ) values (
    p_opportunity_id, p_publisher_org_id, p_advertiser_org_id, p_campaign_id, 'reserved',
    p_price_cents, v_publisher_cents, p_price_cents - v_publisher_cents,
    'USD', p_idempotency_key, pg_catalog.now()
  ) returning * into v_transaction;

  update public.campaign_daily_usage u
  set reserved_cents = u.reserved_cents + p_price_cents,
      reservation_count = u.reservation_count + 1
  where u.campaign_id = p_campaign_id and u.usage_date = v_today;

  return query select
    v_transaction.id, v_transaction.status, v_transaction.advertiser_price_cents, true, null::text;
exception
  when unique_violation then
    select t.* into v_existing
    from public.transactions t
    where t.opportunity_id = p_opportunity_id or t.idempotency_key = p_idempotency_key
    limit 1;

    if found then
      return query select
        v_existing.id, v_existing.status, v_existing.advertiser_price_cents, false, null::text;
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
