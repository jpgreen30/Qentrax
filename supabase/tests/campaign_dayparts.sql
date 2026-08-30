-- Phase 4/5: day-of-week and daypart scheduling, evaluated in the campaign's
-- own timezone, plus the monthly cap and budget enforced inside the atomic
-- reservation.
\set ON_ERROR_STOP on
set search_path = public;

begin;

insert into organizations (id, type, legal_name) values
  ('d0000000-0000-0000-0000-0000000000d1','advertiser','Daypart Advertiser'),
  ('d0000000-0000-0000-0000-0000000000d2','publisher','Daypart Publisher');
insert into verticals (id, code, name) values ('d0000000-0000-0000-0000-0000000000d3','dp','Daypart');
insert into publisher_sources (id, publisher_org_id, name) values
  ('d0000000-0000-0000-0000-0000000000d4','d0000000-0000-0000-0000-0000000000d2','DP Source');

insert into campaigns (id, advertiser_org_id, name, status, timezone)
  values ('d0000000-0000-0000-0000-0000000000c1','d0000000-0000-0000-0000-0000000000d1',
          'Weekday Business Hours','active','America/Los_Angeles');

do $$
declare
  v_camp uuid := 'd0000000-0000-0000-0000-0000000000c1';
  v_opp uuid;
  v_res record;
  i int;
begin
  ---------------------------------------------------------------------------
  -- With no windows configured a campaign is always on, preserving the
  -- behaviour of every campaign that predates scheduling.
  ---------------------------------------------------------------------------
  if not campaign_is_in_daypart(v_camp, '2026-08-30 12:00:00+00'::timestamptz) then
    raise exception 'a campaign with no windows should always be in daypart';
  end if;

  -- Monday to Friday, 09:00-17:00 local.
  insert into campaign_dayparts (campaign_id, day_of_week, start_minute, end_minute)
  select v_camp, d, 540, 1020 from generate_series(1,5) d;

  ---------------------------------------------------------------------------
  -- Boundaries, in local time. 2026-08-31 is a Monday.
  -- PDT is UTC-7, so 09:00 local is 16:00Z.
  ---------------------------------------------------------------------------
  if campaign_is_in_daypart(v_camp, '2026-08-31 15:59:00+00'::timestamptz) then
    raise exception 'one minute before the window opens should be outside';
  end if;
  if not campaign_is_in_daypart(v_camp, '2026-08-31 16:00:00+00'::timestamptz) then
    raise exception 'the opening minute should be inside (start is inclusive)';
  end if;
  if not campaign_is_in_daypart(v_camp, '2026-08-31 23:59:00+00'::timestamptz) then
    raise exception 'one minute before close should be inside';
  end if;
  -- 17:00 local is 00:00Z the next day; end_minute is exclusive.
  if campaign_is_in_daypart(v_camp, '2026-09-01 00:00:00+00'::timestamptz) then
    raise exception 'the closing minute should be outside (end is exclusive)';
  end if;

  ---------------------------------------------------------------------------
  -- The schedule follows local time, not UTC. 2026-08-31 08:00Z is Monday in
  -- UTC but still 01:00 Sunday in Los Angeles, which has no window.
  ---------------------------------------------------------------------------
  if campaign_is_in_daypart(v_camp, '2026-08-31 08:00:00+00'::timestamptz) then
    raise exception 'schedule evaluated in UTC instead of the campaign timezone';
  end if;

  -- Saturday 2026-09-05 midday local has no window.
  if campaign_is_in_daypart(v_camp, '2026-09-05 19:00:00+00'::timestamptz) then
    raise exception 'weekend traffic should be outside a weekday-only schedule';
  end if;

  ---------------------------------------------------------------------------
  -- DST: the window stays at 09:00 local either side of the transition.
  -- 2026-03-09 is the Monday after spring forward (PDT, UTC-7).
  -- 2026-03-02 is the Monday before (PST, UTC-8), when 09:00 local is 17:00Z.
  ---------------------------------------------------------------------------
  if not campaign_is_in_daypart(v_camp, '2026-03-02 17:00:00+00'::timestamptz) then
    raise exception 'window should open at 09:00 local under PST';
  end if;
  if campaign_is_in_daypart(v_camp, '2026-03-02 16:00:00+00'::timestamptz) then
    raise exception 'window should not open an hour early under PST';
  end if;
  if not campaign_is_in_daypart(v_camp, '2026-03-09 16:00:00+00'::timestamptz) then
    raise exception 'window should open at 09:00 local under PDT';
  end if;

  ---------------------------------------------------------------------------
  -- Multiple windows in one day are supported.
  ---------------------------------------------------------------------------
  insert into campaign_dayparts (campaign_id, day_of_week, start_minute, end_minute)
  values (v_camp, 6, 600, 720), (v_camp, 6, 840, 960);

  -- Saturday 2026-09-05: 11:00 local (18:00Z) is inside the first window.
  if not campaign_is_in_daypart(v_camp, '2026-09-05 18:00:00+00'::timestamptz) then
    raise exception 'first Saturday window should be active at 11:00 local';
  end if;
  -- 13:00 local (20:00Z) sits in the gap between the two windows.
  if campaign_is_in_daypart(v_camp, '2026-09-05 20:00:00+00'::timestamptz) then
    raise exception 'the gap between two windows should be outside';
  end if;
  -- 15:00 local (22:00Z) is inside the second window.
  if not campaign_is_in_daypart(v_camp, '2026-09-05 22:00:00+00'::timestamptz) then
    raise exception 'second Saturday window should be active at 15:00 local';
  end if;

  ---------------------------------------------------------------------------
  -- Window shape constraints.
  ---------------------------------------------------------------------------
  begin
    insert into campaign_dayparts (campaign_id, day_of_week, start_minute, end_minute)
    values (v_camp, 1, 1020, 540);
    raise exception 'an inverted window should be rejected';
  exception when check_violation then null;
  end;

  begin
    insert into campaign_dayparts (campaign_id, day_of_week, start_minute, end_minute)
    values (v_camp, 8, 0, 60);
    raise exception 'day_of_week 8 should be rejected';
  exception when check_violation then null;
  end;

  begin
    insert into campaign_dayparts (campaign_id, day_of_week, start_minute, end_minute)
    values (v_camp, 1, 540, 1020);
    raise exception 'a duplicate window should be rejected';
  exception when unique_violation then null;
  end;

  -- A window ending exactly at midnight is valid.
  insert into campaign_dayparts (campaign_id, day_of_week, start_minute, end_minute)
  values (v_camp, 7, 1200, 1440);

  raise notice 'daypart evaluation: PASS';
end $$;

---------------------------------------------------------------------------
-- The reservation refuses to sell a campaign outside its schedule.
---------------------------------------------------------------------------
do $$
declare
  v_camp uuid := 'd0000000-0000-0000-0000-0000000000ca';
  v_opp uuid;
  v_res record;
begin
  -- A campaign whose only window is Monday 00:00-00:01, so it is almost
  -- certainly closed right now regardless of when the suite runs.
  insert into campaigns (id, advertiser_org_id, name, status, timezone)
    values (v_camp,'d0000000-0000-0000-0000-0000000000d1','Closed','active','America/Los_Angeles');
  insert into campaign_dayparts (campaign_id, day_of_week, start_minute, end_minute)
    values (v_camp, 1, 0, 1);

  insert into opportunities (public_transaction_id, publisher_org_id, source_id, vertical_id)
    values ('QL-DP-1','d0000000-0000-0000-0000-0000000000d2',
            'd0000000-0000-0000-0000-0000000000d4','d0000000-0000-0000-0000-0000000000d3')
    returning id into v_opp;

  -- Only assert when the window really is shut; otherwise the run lands inside
  -- that one minute and the expectation would be wrong.
  if not campaign_is_in_daypart(v_camp, now()) then
    select * into v_res from reserve_campaign_transaction(
      v_opp,'d0000000-0000-0000-0000-0000000000d2','d0000000-0000-0000-0000-0000000000d1',
      v_camp, 1000, 'dp-closed-1');

    if v_res.error_code is distinct from 'OUTSIDE_DAYPART' then
      raise exception 'expected OUTSIDE_DAYPART, got %', coalesce(v_res.error_code,'a sale');
    end if;
    if exists (select 1 from transactions where campaign_id = v_camp) then
      raise exception 'a transaction was created outside the daypart';
    end if;
  end if;

  raise notice 'daypart enforcement: PASS';
end $$;

---------------------------------------------------------------------------
-- Monthly cap and monthly budget.
---------------------------------------------------------------------------
do $$
declare
  v_camp uuid := 'd0000000-0000-0000-0000-0000000000cb';
  v_opp uuid;
  v_res record;
  i int;
  v_sold int := 0;
begin
  insert into campaigns (id, advertiser_org_id, name, status, timezone, monthly_cap)
    values (v_camp,'d0000000-0000-0000-0000-0000000000d1','Monthly','active','America/Los_Angeles',3);

  for i in 1..6 loop
    insert into opportunities (public_transaction_id, publisher_org_id, source_id, vertical_id)
      values ('QL-MC-'||i,'d0000000-0000-0000-0000-0000000000d2',
              'd0000000-0000-0000-0000-0000000000d4','d0000000-0000-0000-0000-0000000000d3')
      returning id into v_opp;

    select * into v_res from reserve_campaign_transaction(
      v_opp,'d0000000-0000-0000-0000-0000000000d2','d0000000-0000-0000-0000-0000000000d1',
      v_camp, 1000, 'mc-'||i);

    if v_res.error_code is null then
      v_sold := v_sold + 1;
    elsif v_res.error_code <> 'MONTHLY_CAP_REACHED' then
      raise exception 'unexpected error %', v_res.error_code;
    end if;
  end loop;

  if v_sold <> 3 then
    raise exception 'monthly cap of 3 admitted % sales', v_sold;
  end if;

  raise notice 'monthly cap: PASS';
end $$;

do $$
declare
  v_camp uuid := 'd0000000-0000-0000-0000-0000000000cc';
  v_opp uuid;
  v_res record;
  i int;
  v_sold int := 0;
begin
  insert into campaigns (id, advertiser_org_id, name, status, timezone, monthly_budget_cents)
    values (v_camp,'d0000000-0000-0000-0000-0000000000d1','MonthlyBudget','active',
            'America/Los_Angeles', 2500);

  for i in 1..6 loop
    insert into opportunities (public_transaction_id, publisher_org_id, source_id, vertical_id)
      values ('QL-MB-'||i,'d0000000-0000-0000-0000-0000000000d2',
              'd0000000-0000-0000-0000-0000000000d4','d0000000-0000-0000-0000-0000000000d3')
      returning id into v_opp;

    select * into v_res from reserve_campaign_transaction(
      v_opp,'d0000000-0000-0000-0000-0000000000d2','d0000000-0000-0000-0000-0000000000d1',
      v_camp, 1000, 'mb-'||i);

    if v_res.error_code is null then
      v_sold := v_sold + 1;
    elsif v_res.error_code <> 'MONTHLY_BUDGET_REACHED' then
      raise exception 'unexpected error %', v_res.error_code;
    end if;
  end loop;

  -- 2500c admits two 1000c reservations; the third would reach 3000.
  if v_sold <> 2 then
    raise exception 'monthly budget of 2500c admitted % sales at 1000c', v_sold;
  end if;

  raise notice 'monthly budget: PASS';
end $$;

rollback;
