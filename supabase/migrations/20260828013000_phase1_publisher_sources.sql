begin;

-- Publisher sources: org-scoped inventory
create table if not exists public.publisher_sources (
  id uuid primary key default gen_random_uuid(),
  publisher_org_id uuid not null references public.organizations(id),
  name text not null,
  channel text,
  domain text,
  acquisition_method text,
  estimated_monthly_volume integer,
  status text not null default 'draft' check(status in ('draft', 'pending_review', 'active', 'suspended', 'closed')),
  quality_score numeric(5, 2),
  suspension_reason_code text,
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check(version > 0),
  unique(publisher_org_id, name)
);

-- Many-to-many: which verticals/products this source offers
create table if not exists public.source_verticals (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.publisher_sources(id) on delete cascade,
  vertical_id uuid not null references public.verticals(id),
  product_id uuid references public.products(id),
  geography_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(source_id, vertical_id, product_id)
);

-- Consent templates per source
create table if not exists public.consent_templates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.publisher_sources(id) on delete cascade,
  version integer not null,
  language text not null default 'en',
  disclosure_text text not null,
  proof_method text not null,
  effective_at timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique(source_id, version)
);

-- Daily quality metrics per source
create table if not exists public.source_quality_daily (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.publisher_sources(id) on delete cascade,
  metric_date date not null,
  submitted integer not null default 0,
  accepted integer not null default 0,
  rejected integer not null default 0,
  duplicate_count integer not null default 0,
  contactability_rate numeric(5, 2),
  conversion_rate numeric(5, 2),
  quality_score numeric(5, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_id, metric_date)
);

create index publisher_sources_org_idx on public.publisher_sources(publisher_org_id);
create index publisher_sources_status_idx on public.publisher_sources(status) where status != 'closed';
create index source_verticals_source_idx on public.source_verticals(source_id);
create index source_verticals_vertical_idx on public.source_verticals(vertical_id);
create index consent_templates_source_idx on public.consent_templates(source_id);
create index source_quality_daily_source_idx on public.source_quality_daily(source_id);

-- Organization-scoped RLS
alter table public.publisher_sources enable row level security;
alter table public.source_verticals enable row level security;
alter table public.consent_templates enable row level security;
alter table public.source_quality_daily enable row level security;

create policy publisher_sources_own_select on public.publisher_sources for select to authenticated
  using (publisher_org_id = public.org_id_from_auth());

create policy publisher_sources_own_update on public.publisher_sources for update to authenticated
  using (publisher_org_id = public.org_id_from_auth());

create policy source_verticals_own_select on public.source_verticals for select to authenticated
  using (source_id in (select id from public.publisher_sources where publisher_org_id = public.org_id_from_auth()));

create policy consent_templates_own_select on public.consent_templates for select to authenticated
  using (source_id in (select id from public.publisher_sources where publisher_org_id = public.org_id_from_auth()));

create policy source_quality_daily_own_select on public.source_quality_daily for select to authenticated
  using (source_id in (select id from public.publisher_sources where publisher_org_id = public.org_id_from_auth()));

commit;
