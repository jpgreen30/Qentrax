begin;

-- Verticals and products are platform-wide, not org-scoped
create table if not exists public.verticals (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check(code ~ '^[a-z_]+$'),
  name text not null,
  description text,
  vertical_type text not null default 'marketplace',
  active boolean not null default true,
  field_schema_json jsonb not null default '{}',
  consent_requirements_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  vertical_id uuid not null references public.verticals(id),
  code text not null check(code ~ '^[a-z_]+$'),
  name text not null,
  description text,
  active boolean not null default true,
  field_overrides_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(vertical_id, code)
);

create index verticals_code_idx on public.verticals(code) where active;
create index products_vertical_id_idx on public.products(vertical_id) where active;

-- Platform read access
alter table public.verticals enable row level security;
alter table public.products enable row level security;

create policy verticals_authenticated_select on public.verticals for select to authenticated using (active);
create policy products_authenticated_select on public.products for select to authenticated using (active);

commit;
