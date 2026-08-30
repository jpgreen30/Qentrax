begin;

-- Phase 0 reproducibility: a database built from migrations alone seeded no
-- rows in public.roles, while organization_members.role_id is NOT NULL. No
-- membership could be created at all, and is_platform_admin() resolves through
-- r.code in ('admin_superuser','admin_compliance','admin_finance'), so no
-- platform admin could ever exist either. Every admin surface and every
-- membership-based test was therefore unreachable on a clean install.
--
-- These are reference rows, not fixtures: the role vocabulary is part of the
-- schema contract that is_platform_admin() and the workspace surfaces read.
-- Ids are fixed so environments agree and re-running is a no-op.

insert into public.roles (id, code, name) values
  -- Platform. These three are exactly what is_platform_admin() accepts.
  ('00000000-0000-0000-0000-0000000000a1', 'admin_superuser',  'Platform Superuser'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin_compliance', 'Platform Compliance'),
  ('00000000-0000-0000-0000-0000000000a3', 'admin_finance',    'Platform Finance'),
  -- Advertiser.
  ('00000000-0000-0000-0000-0000000000b1', 'advertiser_owner',   'Advertiser Owner'),
  ('00000000-0000-0000-0000-0000000000b2', 'advertiser_manager', 'Advertiser Manager'),
  ('00000000-0000-0000-0000-0000000000b3', 'advertiser_analyst', 'Advertiser Analyst'),
  -- Publisher.
  ('00000000-0000-0000-0000-0000000000c1', 'publisher_owner',   'Publisher Owner'),
  ('00000000-0000-0000-0000-0000000000c2', 'publisher_manager', 'Publisher Manager'),
  ('00000000-0000-0000-0000-0000000000c3', 'publisher_analyst', 'Publisher Analyst')
on conflict (id) do update
  set code = excluded.code,
      name = excluded.name;

-- Permission codes are grouped by surface and action. Analyst roles are
-- read-only; owners hold the billing and member-management rights their
-- managers do not.
insert into public.role_permissions (role_id, permission_code)
select r.id, p.permission_code
from public.roles r
join (values
  ('admin_superuser',  'platform.manage'),
  ('admin_superuser',  'vertical.write'),
  ('admin_superuser',  'offer.write'),
  ('admin_superuser',  'organization.manage'),
  ('admin_superuser',  'campaign.read_all'),
  ('admin_superuser',  'delivery.replay'),
  ('admin_superuser',  'audit.read'),
  ('admin_superuser',  'finance.manage'),

  ('admin_compliance', 'vertical.read'),
  ('admin_compliance', 'offer.read'),
  ('admin_compliance', 'organization.manage'),
  ('admin_compliance', 'campaign.read_all'),
  ('admin_compliance', 'audit.read'),

  ('admin_finance',    'finance.manage'),
  ('admin_finance',    'campaign.read_all'),
  ('admin_finance',    'audit.read'),

  ('advertiser_owner',   'campaign.write'),
  ('advertiser_owner',   'campaign.read'),
  ('advertiser_owner',   'integration.write'),
  ('advertiser_owner',   'report.read'),
  ('advertiser_owner',   'conversion.write'),
  ('advertiser_owner',   'billing.manage'),
  ('advertiser_owner',   'member.manage'),

  ('advertiser_manager', 'campaign.write'),
  ('advertiser_manager', 'campaign.read'),
  ('advertiser_manager', 'integration.write'),
  ('advertiser_manager', 'report.read'),
  ('advertiser_manager', 'conversion.write'),

  ('advertiser_analyst', 'campaign.read'),
  ('advertiser_analyst', 'report.read'),

  ('publisher_owner',   'source.write'),
  ('publisher_owner',   'source.read'),
  ('publisher_owner',   'demand.read'),
  ('publisher_owner',   'report.read'),
  ('publisher_owner',   'payout.manage'),
  ('publisher_owner',   'member.manage'),

  ('publisher_manager', 'source.write'),
  ('publisher_manager', 'source.read'),
  ('publisher_manager', 'demand.read'),
  ('publisher_manager', 'report.read'),

  ('publisher_analyst', 'source.read'),
  ('publisher_analyst', 'report.read')
) as p(role_code, permission_code) on p.role_code = r.code
on conflict do nothing;

commit;
