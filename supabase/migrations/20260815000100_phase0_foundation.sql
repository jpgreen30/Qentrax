begin;
create extension if not exists pgcrypto;
create type public.organization_type as enum ('advertiser','publisher','platform');
create type public.record_status as enum ('active','suspended','closed');
create table public.users (id uuid primary key default gen_random_uuid(), auth_subject uuid not null unique, email text not null unique, display_name text not null, status public.record_status not null default 'active', last_login_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1 check(version>0));
create table public.organizations (id uuid primary key default gen_random_uuid(), type public.organization_type not null, legal_name text not null, dba_name text, website text, tax_country char(2), status public.record_status not null default 'active', onboarding_status text not null default 'draft', risk_tier text not null default 'unrated', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1 check(version>0));
create table public.roles (id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, created_at timestamptz not null default now());
create table public.role_permissions (role_id uuid not null references public.roles(id), permission_code text not null, primary key(role_id,permission_code));
create table public.organization_members (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), user_id uuid not null references public.users(id), role_id uuid not null references public.roles(id), status public.record_status not null default 'active', invited_by uuid references public.users(id), joined_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1, unique(organization_id,user_id));
create table public.reason_codes (code text primary key check(code ~ '^[A-Z]+_[A-Z0-9_]+$'), family text not null, description text not null, active boolean not null default true, created_at timestamptz not null default now());
create table public.audit_events (id uuid primary key default gen_random_uuid(), actor_user_id uuid references public.users(id), actor_org_id uuid references public.organizations(id), action text not null, resource_type text not null, resource_id uuid, reason text, before_redacted jsonb, after_redacted jsonb, ip_hash text, request_id text not null, created_at timestamptz not null default now());
create or replace function public.is_organization_member(target_organization_id uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.organization_members om
    join public.users u on u.id = om.user_id
    where om.organization_id = target_organization_id
      and om.status = 'active'
      and u.status = 'active'
      and u.auth_subject = (select auth.uid())
  )
$$;
alter table public.users enable row level security;
alter table public.organizations enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.organization_members enable row level security;
alter table public.reason_codes enable row level security;
alter table public.audit_events enable row level security;
create policy users_self_select on public.users for select to authenticated using (auth_subject = (select auth.uid()));
create policy organizations_tenant_select on public.organizations for select to authenticated using (public.is_organization_member(id));
create policy roles_authenticated_select on public.roles for select to authenticated using (true);
create policy role_permissions_authenticated_select on public.role_permissions for select to authenticated using (true);
create policy members_tenant_select on public.organization_members for select to authenticated using (public.is_organization_member(organization_id));
create policy reason_codes_authenticated_select on public.reason_codes for select to authenticated using (active);
create policy audit_tenant_select on public.audit_events for select to authenticated using (public.is_organization_member(actor_org_id));
create or replace function public.prevent_audit_mutation() returns trigger language plpgsql set search_path = '' as $$ begin raise exception 'audit_events are append-only'; end $$;
create trigger audit_events_immutable before update or delete on public.audit_events for each row execute function public.prevent_audit_mutation();
commit;
