-- Phase 14: row-level security must keep one tenant out of another's data.
-- Each case authenticates as a real member of an organization (the
-- `authenticated` role plus that member's auth subject) and asserts what is and
-- is not visible. service_role is deliberately not used; it bypasses RLS.
\set ON_ERROR_STOP on
set search_path = public;

begin;

-- Two advertisers, one publisher, one transaction belonging to advertiser A.
insert into organizations (id, type, legal_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001','advertiser','Advertiser A'),
  ('bbbbbbbb-0000-0000-0000-000000000002','advertiser','Advertiser B'),
  ('cccccccc-0000-0000-0000-000000000003','publisher','Publisher P'),
  ('dddddddd-0000-0000-0000-000000000004','publisher','Publisher Q');

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000a1','a@example.test'),
  ('b0000000-0000-0000-0000-0000000000b1','b@example.test');

-- A clean migrated database seeds no roles, and organization_members.role_id is
-- NOT NULL, so a membership cannot be created without one. Tracked as a Phase 0
-- seed-data gap; the test provides its own.
insert into roles (id, code, name)
  values ('99000000-0000-0000-0000-000000000099','member','Member')
  on conflict do nothing;

-- The auth bootstrap trigger already mirrored these into public.users, so
-- adopt those rows rather than inserting duplicates.
update users set display_name = 'User A', status = 'active'
  where auth_subject = 'a0000000-0000-0000-0000-0000000000a1';
update users set display_name = 'User B', status = 'active'
  where auth_subject = 'b0000000-0000-0000-0000-0000000000b1';

insert into organization_members (organization_id, user_id, role_id, status)
select 'aaaaaaaa-0000-0000-0000-000000000001', id, '99000000-0000-0000-0000-000000000099', 'active'
  from users where auth_subject = 'a0000000-0000-0000-0000-0000000000a1';
insert into organization_members (organization_id, user_id, role_id, status)
select 'bbbbbbbb-0000-0000-0000-000000000002', id, '99000000-0000-0000-0000-000000000099', 'active'
  from users where auth_subject = 'b0000000-0000-0000-0000-0000000000b1';

insert into verticals (id, code, name) values ('e0000000-0000-0000-0000-0000000000e1','iso','Isolation');
insert into publisher_sources (id, publisher_org_id, name) values
  ('f0000000-0000-0000-0000-0000000000f1','cccccccc-0000-0000-0000-000000000003','Source P');
insert into opportunities (id, public_transaction_id, publisher_org_id, source_id, vertical_id) values
  ('01000000-0000-0000-0000-000000000001','QL-ISO-1','cccccccc-0000-0000-0000-000000000003',
   'f0000000-0000-0000-0000-0000000000f1','e0000000-0000-0000-0000-0000000000e1');
insert into campaigns (id, advertiser_org_id, name, status) values
  ('02000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','A Campaign','active');
insert into transactions (
  id, opportunity_id, publisher_org_id, advertiser_org_id, campaign_id, status,
  advertiser_price_cents, publisher_amount_cents, platform_margin_cents, idempotency_key
) values (
  '03000000-0000-0000-0000-000000000003','01000000-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001',
  '02000000-0000-0000-0000-000000000002','charged', 5000, 4250, 750, 'iso-1');

-- Authenticate as a given auth subject for the duration of the checks.
create or replace function pg_temp.act_as(p_subject text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_subject, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  -- app.org_id is a service-side override; clear it so membership decides.
  perform set_config('app.org_id', null, true);
end $$;

do $$
declare
  v_visible int;
begin
  set local role authenticated;

  ---------------------------------------------------------------------------
  -- Advertiser A sees its own transaction.
  ---------------------------------------------------------------------------
  perform pg_temp.act_as('a0000000-0000-0000-0000-0000000000a1');
  select count(*) into v_visible from transactions;
  if v_visible <> 1 then
    raise exception 'advertiser A should see its own transaction, saw %', v_visible;
  end if;

  select count(*) into v_visible from campaigns;
  if v_visible <> 1 then
    raise exception 'advertiser A should see its own campaign, saw %', v_visible;
  end if;

  ---------------------------------------------------------------------------
  -- Advertiser B sees none of it.
  ---------------------------------------------------------------------------
  perform pg_temp.act_as('b0000000-0000-0000-0000-0000000000b1');
  select count(*) into v_visible from transactions;
  if v_visible <> 0 then
    raise exception 'advertiser B must not read advertiser A transactions, saw %', v_visible;
  end if;

  select count(*) into v_visible from campaigns;
  if v_visible <> 0 then
    raise exception 'advertiser B must not read advertiser A campaigns, saw %', v_visible;
  end if;

  -- Targeting the row by primary key must not bypass the policy.
  select count(*) into v_visible from transactions
    where id = '03000000-0000-0000-0000-000000000003';
  if v_visible <> 0 then
    raise exception 'advertiser B read advertiser A transaction by id';
  end if;

  ---------------------------------------------------------------------------
  -- Cross-tenant writes must not take effect.
  ---------------------------------------------------------------------------
  update transactions set advertiser_price_cents = 1
    where id = '03000000-0000-0000-0000-000000000003';
  if (select advertiser_price_cents from transactions
      where id = '03000000-0000-0000-0000-000000000003') is not null then
    raise exception 'advertiser B can see the row it attempted to update';
  end if;

  update campaigns set name = 'hijacked'
    where id = '02000000-0000-0000-0000-000000000002';

  -- An unauthenticated caller sees nothing at all.
  perform set_config('request.jwt.claim.sub', null, true);
  select count(*) into v_visible from transactions;
  if v_visible <> 0 then
    raise exception 'unauthenticated caller saw % transactions', v_visible;
  end if;

  reset role;

  -- Confirm from outside RLS that neither write landed.
  if (select advertiser_price_cents from transactions
      where id = '03000000-0000-0000-0000-000000000003') <> 5000 then
    raise exception 'cross-tenant update mutated advertiser A price';
  end if;
  if (select name from campaigns where id = '02000000-0000-0000-0000-000000000002') <> 'A Campaign' then
    raise exception 'cross-tenant update renamed advertiser A campaign';
  end if;

  raise notice 'tenant_isolation: PASS';
end $$;

rollback;
