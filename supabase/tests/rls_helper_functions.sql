-- Regression cover for the RLS helper functions. Both defects below made
-- authenticated reads fail outright, so these assert the failure modes are gone
-- rather than only that the happy path works.
\set ON_ERROR_STOP on
set search_path = public;

begin;

insert into roles (id, code, name)
  values ('99000000-0000-0000-0000-000000000099','member','Member')
  on conflict do nothing;

insert into organizations (id, type, legal_name)
  values ('aaaaaaaa-0000-0000-0000-00000000aa01','advertiser','Helper Advertiser');

insert into auth.users (id, email)
  values ('a0000000-0000-0000-0000-00000000aa01','helper@example.test');

update users set display_name = 'Helper', status = 'active'
  where auth_subject = 'a0000000-0000-0000-0000-00000000aa01';

insert into organization_members (organization_id, user_id, role_id, status)
select 'aaaaaaaa-0000-0000-0000-00000000aa01', id,
       '99000000-0000-0000-0000-000000000099', 'active'
  from users where auth_subject = 'a0000000-0000-0000-0000-00000000aa01';

do $$
declare
  v_count int;
  v_org uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-00000000aa01', true);
  perform set_config('request.jwt.claim.role','authenticated', true);

  -- Previously "stack depth limit exceeded": the organization_members policy
  -- called is_organization_member(), which read organization_members under the
  -- same policy.
  select count(*) into v_count from organization_members;
  if v_count <> 1 then
    raise exception 'member should see exactly their own membership, saw %', v_count;
  end if;

  -- Resolves through membership when no service-side override is present.
  select org_id_from_auth() into v_org;
  if v_org <> 'aaaaaaaa-0000-0000-0000-00000000aa01' then
    raise exception 'org_id_from_auth resolved to % via membership', v_org;
  end if;

  -- Previously 22P02 "invalid input syntax for type uuid" on a blank override.
  perform set_config('app.org_id', '', true);
  select org_id_from_auth() into v_org;
  if v_org <> 'aaaaaaaa-0000-0000-0000-00000000aa01' then
    raise exception 'blank app.org_id should fall back to membership, got %', v_org;
  end if;

  perform set_config('app.org_id', '   ', true);
  select org_id_from_auth() into v_org;
  if v_org <> 'aaaaaaaa-0000-0000-0000-00000000aa01' then
    raise exception 'whitespace app.org_id should fall back to membership, got %', v_org;
  end if;

  -- A real override still wins over membership.
  perform set_config('app.org_id', 'bbbbbbbb-0000-0000-0000-00000000bb02', true);
  select org_id_from_auth() into v_org;
  if v_org <> 'bbbbbbbb-0000-0000-0000-00000000bb02' then
    raise exception 'explicit app.org_id override was not honoured, got %', v_org;
  end if;

  perform set_config('app.org_id', null, true);

  -- The membership check answers truthfully for a non-member organization.
  if is_organization_member('bbbbbbbb-0000-0000-0000-00000000bb02') then
    raise exception 'is_organization_member returned true for a foreign org';
  end if;
  if not is_organization_member('aaaaaaaa-0000-0000-0000-00000000aa01') then
    raise exception 'is_organization_member returned false for the caller''s own org';
  end if;

  reset role;
  raise notice 'rls_helper_functions: PASS';
end $$;

rollback;
