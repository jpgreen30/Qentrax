-- Verifies that campaign cap/budget boundaries follow the campaign's local
-- timezone rather than UTC, and that reserve/finalize agree on which
-- campaign_daily_usage bucket a reservation occupies.
\set ON_ERROR_STOP on
set search_path = public;

-- Fixtures are rolled back so the test is repeatable against any database.
begin;

do $$
declare
  v_org_adv uuid;
  v_org_pub uuid;
  v_vertical uuid;
  v_source uuid;
  v_opp uuid;
  v_campaign uuid;
  v_tz text := 'America/Los_Angeles';
  v_local_date date;
  v_utc_date date;
  v_bucket date;
  v_res record;
  v_fin record;
  v_usage campaign_daily_usage%rowtype;
begin
  ---------------------------------------------------------------------------
  -- 1. campaign_usage_date resolves the local calendar day, not the UTC one.
  ---------------------------------------------------------------------------
  -- 2026-08-30 03:00Z is still 2026-08-29 20:00 in Los Angeles (PDT, UTC-7).
  if campaign_usage_date(v_tz, '2026-08-30 03:00:00+00'::timestamptz) <> date '2026-08-29' then
    raise exception 'local date before UTC rollover: expected 2026-08-29, got %',
      campaign_usage_date(v_tz, '2026-08-30 03:00:00+00'::timestamptz);
  end if;

  -- One minute after local midnight the local day has advanced.
  if campaign_usage_date(v_tz, '2026-08-30 07:01:00+00'::timestamptz) <> date '2026-08-30' then
    raise exception 'local date after local midnight: expected 2026-08-30, got %',
      campaign_usage_date(v_tz, '2026-08-30 07:01:00+00'::timestamptz);
  end if;

  -- One minute before local midnight it has not.
  if campaign_usage_date(v_tz, '2026-08-30 06:59:00+00'::timestamptz) <> date '2026-08-29' then
    raise exception 'local date before local midnight: expected 2026-08-29, got %',
      campaign_usage_date(v_tz, '2026-08-30 06:59:00+00'::timestamptz);
  end if;

  ---------------------------------------------------------------------------
  -- 2. DST transitions shift the UTC offset; the local day must still be right.
  ---------------------------------------------------------------------------
  -- Spring forward 2026-03-08: PST (UTC-8) before, PDT (UTC-7) after.
  -- 2026-03-08 07:59Z = 2026-03-07 23:59 PST -> still the 7th.
  if campaign_usage_date(v_tz, '2026-03-08 07:59:00+00'::timestamptz) <> date '2026-03-07' then
    raise exception 'DST spring-forward pre-midnight: expected 2026-03-07, got %',
      campaign_usage_date(v_tz, '2026-03-08 07:59:00+00'::timestamptz);
  end if;
  if campaign_usage_date(v_tz, '2026-03-08 08:01:00+00'::timestamptz) <> date '2026-03-08' then
    raise exception 'DST spring-forward post-midnight: expected 2026-03-08, got %',
      campaign_usage_date(v_tz, '2026-03-08 08:01:00+00'::timestamptz);
  end if;
  -- Fall back 2026-11-01: local midnight is still at 07:00Z (PDT in effect).
  if campaign_usage_date(v_tz, '2026-11-01 07:01:00+00'::timestamptz) <> date '2026-11-01' then
    raise exception 'DST fall-back post-midnight: expected 2026-11-01, got %',
      campaign_usage_date(v_tz, '2026-11-01 07:01:00+00'::timestamptz);
  end if;

  -- A UTC campaign is unaffected, and blank/null zones degrade to UTC.
  if campaign_usage_date('UTC', '2026-08-30 03:00:00+00'::timestamptz) <> date '2026-08-30' then
    raise exception 'UTC campaign should use the UTC day';
  end if;
  if campaign_usage_date('', '2026-08-30 03:00:00+00'::timestamptz) <> date '2026-08-30'
     or campaign_usage_date(null, '2026-08-30 03:00:00+00'::timestamptz) <> date '2026-08-30' then
    raise exception 'blank/null timezone should fall back to UTC';
  end if;

  ---------------------------------------------------------------------------
  -- 3. reserve_campaign_transaction books into the campaign-local bucket, and
  --    finalize_campaign_transaction releases from that same bucket.
  ---------------------------------------------------------------------------
  insert into organizations (type, legal_name) values ('advertiser', 'TZ Advertiser')
    returning id into v_org_adv;
  insert into organizations (type, legal_name) values ('publisher', 'TZ Publisher')
    returning id into v_org_pub;
  insert into verticals (code, name) values ('tz_solar', 'TZ Solar') returning id into v_vertical;
  insert into publisher_sources (publisher_org_id, name)
    values (v_org_pub, 'TZ Source') returning id into v_source;
  insert into opportunities (public_transaction_id, publisher_org_id, source_id, vertical_id)
    values ('QL-TZ-1', v_org_pub, v_source, v_vertical) returning id into v_opp;

  insert into campaigns (advertiser_org_id, name, status, timezone, daily_cap, daily_budget_cents)
    values (v_org_adv, 'TZ Campaign', 'active', v_tz, 10, 100000)
    returning id into v_campaign;

  v_local_date := campaign_usage_date(v_tz, now());
  v_utc_date   := (timezone('utc', now()))::date;

  select * into v_res from reserve_campaign_transaction(
    v_opp, v_org_pub, v_org_adv, v_campaign, 5000, 'tz-idem-1');

  if v_res.error_code is not null then
    raise exception 'reservation failed unexpectedly: %', v_res.error_code;
  end if;

  select usage_date into v_bucket from campaign_daily_usage where campaign_id = v_campaign;

  if v_bucket <> v_local_date then
    raise exception 'reservation booked to % but campaign-local day is %', v_bucket, v_local_date;
  end if;

  -- When the two calendars disagree right now, prove the old UTC behaviour is gone.
  if v_local_date <> v_utc_date and v_bucket = v_utc_date then
    raise exception 'reservation still using the UTC day (%)', v_utc_date;
  end if;

  select * into v_usage from campaign_daily_usage
    where campaign_id = v_campaign and usage_date = v_local_date;
  if v_usage.reserved_cents <> 5000 or v_usage.reservation_count <> 1 then
    raise exception 'reservation not recorded: reserved=% count=%',
      v_usage.reserved_cents, v_usage.reservation_count;
  end if;

  -- Finalizing must decrement the very bucket the reservation incremented,
  -- otherwise reserved_cents leaks and the budget silently shrinks.
  select * into v_fin from finalize_campaign_transaction(
    v_res.transaction_id, null, true, 'BUYER_ACCEPTED');
  if v_fin.error_code is not null then
    raise exception 'finalize failed unexpectedly: %', v_fin.error_code;
  end if;

  select * into v_usage from campaign_daily_usage
    where campaign_id = v_campaign and usage_date = v_local_date;
  if v_usage.reserved_cents <> 0 or v_usage.reservation_count <> 0 then
    raise exception 'reservation not released from local bucket: reserved=% count=%',
      v_usage.reserved_cents, v_usage.reservation_count;
  end if;
  if v_usage.charged_cents <> 5000 or v_usage.accepted_count <> 1 then
    raise exception 'charge not booked to local bucket: charged=% accepted=%',
      v_usage.charged_cents, v_usage.accepted_count;
  end if;

  if (select count(*) from campaign_daily_usage where campaign_id = v_campaign) <> 1 then
    raise exception 'reserve and finalize disagreed on the usage bucket';
  end if;

  ---------------------------------------------------------------------------
  -- The publisher/platform split. src/lib/publisher/revenue-share.ts mirrors
  -- this so publisher-facing surfaces can quote a rate before a transaction
  -- exists; if either side changes, this fails rather than misquoting.
  ---------------------------------------------------------------------------
  declare
    v_split_opp uuid;
    v_split_res record;
    v_txn transactions%rowtype;
  begin
    insert into opportunities (public_transaction_id, publisher_org_id, source_id, vertical_id)
      values ('QL-SPLIT-1', v_org_pub, v_source, v_vertical) returning id into v_split_opp;

    select * into v_split_res from reserve_campaign_transaction(
      v_split_opp, v_org_pub, v_org_adv, v_campaign, 4501, 'split-1');
    if v_split_res.error_code is not null then
      raise exception 'split reservation failed: %', v_split_res.error_code;
    end if;

    select * into v_txn from transactions where id = v_split_res.transaction_id;

    -- floor(4501 * 0.85) = 3825, leaving 676 platform margin.
    if v_txn.publisher_amount_cents <> 3825 then
      raise exception 'publisher share changed: expected 3825, got %',
        v_txn.publisher_amount_cents;
    end if;
    if v_txn.platform_margin_cents <> 676 then
      raise exception 'platform margin changed: expected 676, got %',
        v_txn.platform_margin_cents;
    end if;
    if v_txn.publisher_amount_cents + v_txn.platform_margin_cents
       <> v_txn.advertiser_price_cents then
      raise exception 'split does not account for the whole price';
    end if;
  end;

  raise notice 'campaign_local_timezone_boundaries: PASS';
end $$;

rollback;
