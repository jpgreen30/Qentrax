-- Minimal identities for the browser suite. Everything else the E2E needs —
-- verticals, schemas, offers, campaigns — is created THROUGH THE PRODUCT by the
-- test itself, which is the point of the exercise.
\set ON_ERROR_STOP on
set search_path = public;

delete from campaign_dayparts where campaign_id in
  (select id from campaigns where name like 'E2E %');
delete from campaigns where name like 'E2E %';
delete from offer_versions where offer_id in (select id from offers where slug like 'e2e-%');
delete from offers where slug like 'e2e-%';
delete from vertical_fields where schema_version_id in (
  select v.id from vertical_schema_versions v
  join verticals t on t.id = v.vertical_id where t.code like 'qxe_%');
delete from vertical_schema_versions where vertical_id in
  (select id from verticals where code like 'qxe_%');
delete from verticals where code like 'qxe_%';

insert into organizations (id, type, legal_name, status, onboarding_status) values
  ('e2e00000-0000-0000-0000-00000000f001','platform','Qentrax Platform','active','approved'),
  ('e2e00000-0000-0000-0000-00000000f002','advertiser','Atlas Growth','active','approved'),
  ('e2e00000-0000-0000-0000-00000000f003','publisher','Northstar Media','active','approved')
on conflict (id) do nothing;

insert into auth.users (id, email) values
  ('e2e00000-0000-0000-0000-00000000a001','admin@qentrax.test'),
  ('e2e00000-0000-0000-0000-00000000a002','buyer@atlas.test'),
  ('e2e00000-0000-0000-0000-00000000a003','supply@northstar.test')
on conflict (id) do nothing;

update users set display_name = 'E2E Admin', status = 'active'
  where auth_subject = 'e2e00000-0000-0000-0000-00000000a001';
update users set display_name = 'E2E Buyer', status = 'active'
  where auth_subject = 'e2e00000-0000-0000-0000-00000000a002';
update users set display_name = 'E2E Supply', status = 'active'
  where auth_subject = 'e2e00000-0000-0000-0000-00000000a003';

insert into organization_members (organization_id, user_id, role_id, status)
select 'e2e00000-0000-0000-0000-00000000f001', u.id, r.id, 'active'
  from users u, roles r
 where u.auth_subject = 'e2e00000-0000-0000-0000-00000000a001' and r.code = 'admin_superuser'
on conflict do nothing;

insert into organization_members (organization_id, user_id, role_id, status)
select 'e2e00000-0000-0000-0000-00000000f002', u.id, r.id, 'active'
  from users u, roles r
 where u.auth_subject = 'e2e00000-0000-0000-0000-00000000a002' and r.code = 'advertiser_owner'
on conflict do nothing;

insert into organization_members (organization_id, user_id, role_id, status)
select 'e2e00000-0000-0000-0000-00000000f003', u.id, r.id, 'active'
  from users u, roles r
 where u.auth_subject = 'e2e00000-0000-0000-0000-00000000a003' and r.code = 'publisher_owner'
on conflict do nothing;

-- A delivery destination for the advertiser, so the campaign builder has a
-- connector to attach and activation is reachable through the product.
insert into connectors (id, organization_id, name, connector_type, status, endpoint_url, timeout_ms)
values ('e2e00000-0000-0000-0000-00000000c001','e2e00000-0000-0000-0000-00000000f002',
        'E2E Webhook','webhook','active','http://127.0.0.1:4010/hook', 10000)
on conflict (id) do update set status = 'active';
