begin;

-- Two defects in the RLS helper functions.
--
-- 1. Infinite recursion. public.organization_members carries the policy
--    is_organization_member(organization_id), and that function selects from
--    organization_members. Because it was declared SECURITY INVOKER, the policy
--    re-applied to the function's own lookup, which re-invoked the function:
--    any authenticated read of that table failed with "stack depth limit
--    exceeded". org_id_from_auth() performs the same lookup and recursed the
--    same way whenever the app.org_id override was absent, which is every
--    request that relies on membership rather than a service-side override.
--
--    Both helpers become SECURITY DEFINER so their internal lookups run without
--    RLS. This does not widen what a caller can see: each returns only a
--    boolean or the caller's own organization id, derived from auth.uid(),
--    which the caller cannot forge.
--
-- 2. Blank override crash. org_id_from_auth cast
--    current_setting('app.org_id', true) directly to uuid. current_setting
--    returns the empty string, not NULL, for a GUC set to an empty value, so a
--    blank override made every RLS-protected query fail with 22P02 instead of
--    falling back to membership. A blank override is now treated as absent.

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.organization_members om
    join public.users u on u.id = om.user_id
    where om.organization_id = target_organization_id
      and om.status = 'active'
      and u.status = 'active'
      and u.auth_subject = (select auth.uid())
  )
$function$;

create or replace function public.org_id_from_auth()
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    nullif(pg_catalog.btrim(current_setting('app.org_id', true)), '')::uuid,
    (select om.organization_id from public.organization_members om
     join public.users u on u.id = om.user_id
     where u.auth_subject = (select auth.uid())
       and om.status = 'active'
       and u.status = 'active'
     limit 1)
  )
$function$;

revoke all on function public.is_organization_member(uuid) from public;
grant execute on function public.is_organization_member(uuid)
  to anon, authenticated, service_role;

revoke all on function public.org_id_from_auth() from public;
grant execute on function public.org_id_from_auth()
  to anon, authenticated, service_role;

commit;
