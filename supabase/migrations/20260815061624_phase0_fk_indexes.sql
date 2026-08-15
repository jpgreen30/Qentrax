create index organization_members_user_id_idx on public.organization_members(user_id);
create index organization_members_role_id_idx on public.organization_members(role_id);
create index organization_members_invited_by_idx on public.organization_members(invited_by) where invited_by is not null;
create index audit_events_actor_user_id_idx on public.audit_events(actor_user_id) where actor_user_id is not null;
create index audit_events_actor_org_id_idx on public.audit_events(actor_org_id) where actor_org_id is not null;
