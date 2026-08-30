-- Phase 0: a database built from migrations alone must be able to create a
-- membership and a platform admin. Before the seed migration, public.roles was
-- empty while organization_members.role_id is NOT NULL, so neither was possible
-- and every admin surface was unreachable on a clean install.
\set ON_ERROR_STOP on
set search_path = public;

begin;

do $$
declare
  v_count int;
  v_admin boolean;
begin
  ---------------------------------------------------------------------------
  -- The reference vocabulary exists.
  ---------------------------------------------------------------------------
  select count(*) into v_count from roles;
  if v_count < 9 then
    raise exception 'expected the seeded role vocabulary, found % roles', v_count;
  end if;

  -- is_platform_admin() resolves through exactly these three codes.
  if not exists (select 1 from roles where code = 'admin_superuser')
     or not exists (select 1 from roles where code = 'admin_compliance')
     or not exists (select 1 from roles where code = 'admin_finance') then
    raise exception 'the role codes is_platform_admin() accepts are not all seeded';
  end if;

  if not exists (select 1 from roles where code = 'advertiser_owner')
     or not exists (select 1 from roles where code = 'publisher_owner') then
    raise exception 'tenant owner roles are not seeded';
  end if;

  -- Permissions are attached, and analyst roles stay read-only.
  select count(*) into v_count from role_permissions;
  if v_count = 0 then
    raise exception 'no role permissions were seeded';
  end if;

  if exists (
    select 1 from role_permissions rp join roles r on r.id = rp.role_id
    where r.code like '%_analyst' and rp.permission_code like '%.write'
  ) then
    raise exception 'an analyst role was granted a write permission';
  end if;

  if not exists (
    select 1 from role_permissions rp join roles r on r.id = rp.role_id
    where r.code = 'admin_superuser' and rp.permission_code = 'offer.write'
  ) then
    raise exception 'admin_superuser cannot write offers';
  end if;
end $$;

---------------------------------------------------------------------------
-- A platform admin can be created from migrations alone, and is_platform_admin()
-- recognises them.
---------------------------------------------------------------------------
insert into organizations (id, type, legal_name)
  values ('a0000000-0000-0000-0000-00000000f001','platform','Qentrax Platform'),
         ('a0000000-0000-0000-0000-00000000f002','advertiser','Some Advertiser');

insert into auth.users (id, email) values
  ('b0000000-0000-0000-0000-00000000f001','admin@example.test'),
  ('b0000000-0000-0000-0000-00000000f002','buyer@example.test');

update users set display_name = 'Admin', status = 'active'
  where auth_subject = 'b0000000-0000-0000-0000-00000000f001';
update users set display_name = 'Buyer', status = 'active'
  where auth_subject = 'b0000000-0000-0000-0000-00000000f002';

insert into organization_members (organization_id, user_id, role_id, status)
select 'a0000000-0000-0000-0000-00000000f001', u.id, r.id, 'active'
  from users u, roles r
 where u.auth_subject = 'b0000000-0000-0000-0000-00000000f001'
   and r.code = 'admin_superuser';

insert into organization_members (organization_id, user_id, role_id, status)
select 'a0000000-0000-0000-0000-00000000f002', u.id, r.id, 'active'
  from users u, roles r
 where u.auth_subject = 'b0000000-0000-0000-0000-00000000f002'
   and r.code = 'advertiser_owner';

do $$
begin
  set local role authenticated;

  perform set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-00000000f001', true);
  if not is_platform_admin() then
    raise exception 'a platform organization member holding admin_superuser is not recognised as admin';
  end if;

  -- An advertiser owner is not a platform admin.
  perform set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-00000000f002', true);
  if is_platform_admin() then
    raise exception 'an advertiser owner was treated as a platform admin';
  end if;

  -- Neither is an unauthenticated caller.
  perform set_config('request.jwt.claim.sub', null, true);
  if is_platform_admin() then
    raise exception 'an unauthenticated caller was treated as a platform admin';
  end if;

  reset role;
  raise notice 'roles_seed: PASS';
end $$;

rollback;
