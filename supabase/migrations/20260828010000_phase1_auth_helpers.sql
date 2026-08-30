begin;

-- Helper to get the authenticated user's current organization
-- This assumes the organization context is passed via a custom header or JWT claim
-- For now, we use a simple approach: get first active membership
create or replace function public.org_id_from_auth() returns uuid
language sql stable security invoker set search_path = '' as $$
  select coalesce(
    (select current_setting('app.org_id', true))::uuid,
    (select om.organization_id from public.organization_members om
     join public.users u on u.id = om.user_id
     where u.auth_subject = (select auth.uid())
       and om.status = 'active'
       and u.status = 'active'
     limit 1)
  )
$$;

commit;
