begin;

drop policy if exists publisher_sources_own_insert on public.publisher_sources;
create policy publisher_sources_own_insert on public.publisher_sources
  for insert to authenticated
  with check (publisher_org_id = public.org_id_from_auth());

drop policy if exists publisher_sources_own_update on public.publisher_sources;
create policy publisher_sources_own_update on public.publisher_sources
  for update to authenticated
  using (publisher_org_id = public.org_id_from_auth())
  with check (publisher_org_id = public.org_id_from_auth());

drop policy if exists opportunities_publisher_insert on public.opportunities;
create policy opportunities_publisher_insert on public.opportunities
  for insert to authenticated
  with check (publisher_org_id = public.org_id_from_auth());

drop policy if exists opportunities_publisher_update on public.opportunities;
create policy opportunities_publisher_update on public.opportunities
  for update to authenticated
  using (publisher_org_id = public.org_id_from_auth())
  with check (publisher_org_id = public.org_id_from_auth());

drop policy if exists validation_runs_publisher_insert on public.validation_runs;
create policy validation_runs_publisher_insert on public.validation_runs
  for insert to authenticated
  with check (
    opportunity_id in (
      select id from public.opportunities where publisher_org_id = public.org_id_from_auth()
    )
  );

drop policy if exists validation_results_publisher_insert on public.validation_results;
create policy validation_results_publisher_insert on public.validation_results
  for insert to authenticated
  with check (
    validation_run_id in (
      select id
      from public.validation_runs
      where opportunity_id in (
        select id from public.opportunities where publisher_org_id = public.org_id_from_auth()
      )
    )
  );

commit;
