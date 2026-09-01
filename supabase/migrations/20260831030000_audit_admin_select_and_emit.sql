-- Platform admins must see the full append-only stream. The original
-- tenant policy only matches actor_org_id membership, so admin audit
-- was empty even when events existed (and many admin writes use null org).
-- Also emit an audit row when an opportunity is created so the Golden Path
-- ping is traceable without weakening production RLS.

create policy audit_admin_select on public.audit_events
  for select to authenticated
  using (public.is_platform_admin());

create or replace function public.emit_opportunity_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (
    actor_org_id,
    action,
    resource_type,
    resource_id,
    reason,
    request_id,
    after_redacted
  ) values (
    new.publisher_org_id,
    'opportunity.received',
    'opportunity',
    new.id,
    coalesce(new.status, 'received'),
    coalesce(new.public_transaction_id, new.id::text),
    jsonb_build_object(
      'public_transaction_id', new.public_transaction_id,
      'status', new.status,
      'source_id', new.source_id
    )
  );
  return new;
end;
$$;

drop trigger if exists opportunities_audit_insert on public.opportunities;
create trigger opportunities_audit_insert
  after insert on public.opportunities
  for each row execute function public.emit_opportunity_audit();
