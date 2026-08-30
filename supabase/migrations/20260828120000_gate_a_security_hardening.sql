begin;

-- Gate A hardening from Supabase security/performance advisors.

alter table public.crm_sync_records enable row level security;
alter table public.webhook_deliveries enable row level security;

create policy crm_sync_records_tenant_select on public.crm_sync_records
  for select to authenticated using (
    exists (
      select 1 from public.crm_integrations ci
      where ci.id = integration_id
        and public.is_organization_member(ci.organization_id)
    )
  );

create policy webhook_deliveries_tenant_select on public.webhook_deliveries
  for select to authenticated using (
    exists (
      select 1 from public.webhook_endpoints we
      where we.id = webhook_endpoint_id
        and public.is_organization_member(we.organization_id)
    )
  );

alter function public.update_crm_integrations_updated_at() set search_path = '';
alter function public.update_crm_sync_records_updated_at() set search_path = '';
alter function public.update_connector_updated_at() set search_path = '';
alter function public.update_webhook_endpoints_updated_at() set search_path = '';
alter function public.update_webhook_deliveries_updated_at() set search_path = '';
alter function public.handle_delivery_attempt() set search_path = '';

drop index if exists public.deliveries_campaign_id_idx;
drop index if exists public.deliveries_opportunity_id_idx;

commit;
