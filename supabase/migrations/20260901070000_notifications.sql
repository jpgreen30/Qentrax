-- In-app notifications: tenant-scoped inbox + security-definer emitter.
-- Additive. Does not alter existing marketplace tables.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title text not null,
  body text not null default '',
  href text,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_org_created_idx
  on public.notifications (organization_id, created_at desc);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create unique index if not exists notifications_dedupe_key_uidx
  on public.notifications (dedupe_key)
  where dedupe_key is not null;

alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    public.is_platform_admin()
    or (organization_id is not null and public.is_organization_member(organization_id))
    or (user_id is not null and user_id = public.current_app_user_id())
  );

drop policy if exists notifications_update_read on public.notifications;
create policy notifications_update_read on public.notifications
  for update to authenticated
  using (
    public.is_platform_admin()
    or (organization_id is not null and public.is_organization_member(organization_id))
    or (user_id is not null and user_id = public.current_app_user_id())
  )
  with check (
    public.is_platform_admin()
    or (organization_id is not null and public.is_organization_member(organization_id))
    or (user_id is not null and user_id = public.current_app_user_id())
  );

-- Writes go through the RPC so callers cannot forge another tenant's inbox.
create or replace function public.emit_notification(
  p_organization_id uuid,
  p_user_id uuid,
  p_type text,
  p_severity text default 'info',
  p_title text default '',
  p_body text default '',
  p_href text default null,
  p_dedupe_key text default null,
  p_payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  if p_type is null or length(trim(p_type)) = 0 then
    raise exception 'notification type is required';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'notification title is required';
  end if;
  if p_severity is null or p_severity not in ('info', 'warning', 'critical') then
    p_severity := 'info';
  end if;

  insert into public.notifications (
    organization_id, user_id, type, severity, title, body, href, payload, dedupe_key
  ) values (
    p_organization_id,
    p_user_id,
    p_type,
    p_severity,
    p_title,
    coalesce(p_body, ''),
    p_href,
    coalesce(p_payload, '{}'::jsonb),
    nullif(p_dedupe_key, '')
  )
  on conflict (dedupe_key) where dedupe_key is not null
  do nothing
  returning id into inserted_id;

  if inserted_id is null and p_dedupe_key is not null then
    select id into inserted_id
    from public.notifications
    where dedupe_key = p_dedupe_key
    limit 1;
  end if;

  return inserted_id;
end;
$$;

revoke all on function public.emit_notification(uuid, uuid, text, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.emit_notification(uuid, uuid, text, text, text, text, text, text, jsonb)
  to authenticated, service_role;
