begin;

-- Row-level security on public.verticals and public.products carried a SELECT
-- policy and nothing else. With RLS enabled and no INSERT/UPDATE/DELETE policy,
-- default-deny meant a platform admin could never create or edit a vertical or
-- product through an authenticated client — the Admin Verticals workspace could
-- not have worked against a real database. Found by the browser end-to-end run,
-- which failed at "create vertical".
--
-- The read policies were also gated on `active`, so a deactivated vertical
-- became invisible to the very administrators responsible for reactivating it.
-- Admins now see all rows; everyone else still sees only active ones.

drop policy if exists verticals_authenticated_select on public.verticals;
create policy verticals_authenticated_select on public.verticals
  for select to authenticated
  using (active or public.is_platform_admin());

create policy verticals_admin_write on public.verticals
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists products_authenticated_select on public.products;
create policy products_authenticated_select on public.products
  for select to authenticated
  using (active or public.is_platform_admin());

create policy products_admin_write on public.products
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

commit;
