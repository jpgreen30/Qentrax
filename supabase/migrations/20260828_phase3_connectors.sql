-- Phase 3: External Connector Infrastructure
-- Connectors table for third-party ping trees, buyers, networks
-- Health tracking and delivery logging

create table if not exists public.connectors (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connector_type text not null, -- EXTERNAL_PING_TREE, EXTERNAL_BUYER, NETWORK, CRM, WEBHOOK, SFTP
  name text not null,
  status text not null default 'testing', -- ACTIVE, TESTING, PAUSED, ERROR, DISABLED
  endpoint_url text,
  method text default 'POST', -- GET, POST, PUT
  headers jsonb, -- Custom headers
  auth_type text, -- none, api_key, bearer, basic, oauth
  auth_credential_ref text, -- Encrypted reference to vault
  request_format text default 'json', -- json, xml, form
  response_format text default 'json', -- json, xml
  ping_field_mapping jsonb default '{}', -- Maps Qentrax fields to external field names
  post_field_mapping jsonb default '{}',
  timeout_ms int default 5000,
  retry_policy jsonb default '{"max_retries":2,"initial_delay_ms":100,"backoff_multiplier":2,"max_delay_ms":2000}',
  health_check_enabled boolean default true,
  health_check_frequency_seconds int default 3600,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (id)
);

create unique index idx_connector_org_name on public.connectors(organization_id, name);

-- Junction table: connectors available for specific verticals
create table if not exists public.connector_verticals (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connector_id uuid not null references public.connectors(id) on delete cascade,
  vertical_id uuid not null references public.verticals(id) on delete cascade,
  enabled boolean not null default true,
  priority int default 0, -- Higher priority connectors are pinged first
  weight int default 1, -- Used in weighted routing
  created_at timestamp with time zone not null default now(),
  primary key (id)
);

create unique index idx_connector_vertical_org on public.connector_verticals(organization_id, connector_id, vertical_id);

-- Health check history for connectors
create table if not exists public.connector_health_checks (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connector_id uuid not null references public.connectors(id) on delete cascade,
  status text not null, -- healthy, degraded, unhealthy
  last_check_at timestamp with time zone not null,
  last_successful_at timestamp with time zone,
  consecutive_failures int not null default 0,
  error_rate numeric(3, 2) not null default 0, -- 0.0 to 1.0
  avg_latency_ms int not null default 0,
  last_error text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (id)
);

create unique index idx_connector_health_org_connector on public.connector_health_checks(organization_id, connector_id);

-- Delivery attempts to external connectors
create table if not exists public.connector_delivery_attempts (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  connector_id uuid not null references public.connectors(id) on delete cascade,
  request_body text, -- Serialized request (may be redacted for PII)
  response_body text,
  response_status_code int,
  latency_ms int,
  success boolean not null,
  error_message text,
  created_at timestamp with time zone not null default now(),
  primary key (id)
);

create index idx_connector_delivery_org_connector on public.connector_delivery_attempts(organization_id, connector_id);
create index idx_connector_delivery_opportunity on public.connector_delivery_attempts(opportunity_id);

-- RLS Policies for connectors
create policy "organizations can view their own connectors"
  on public.connectors for select
  using (
    organization_id = public.org_id_from_auth()
  );

create policy "organizations can manage their own connectors"
  on public.connectors for all
  using (
    organization_id = public.org_id_from_auth()
  )
  with check (
    organization_id = public.org_id_from_auth()
  );

-- RLS Policies for connector_verticals
create policy "organizations can view their own connector_verticals"
  on public.connector_verticals for select
  using (
    organization_id = public.org_id_from_auth()
  );

create policy "organizations can manage their own connector_verticals"
  on public.connector_verticals for all
  using (
    organization_id = public.org_id_from_auth()
  )
  with check (
    organization_id = public.org_id_from_auth()
  );

-- RLS Policies for connector_health_checks
create policy "organizations can view their own connector health"
  on public.connector_health_checks for select
  using (
    organization_id = public.org_id_from_auth()
  );

create policy "connector health updates are internal only"
  on public.connector_health_checks for all
  using (
    organization_id = public.org_id_from_auth()
  )
  with check (
    organization_id = public.org_id_from_auth()
  );

-- RLS Policies for connector_delivery_attempts
create policy "publishers can view their own delivery attempts"
  on public.connector_delivery_attempts for select
  using (
    organization_id = public.org_id_from_auth()
  );

-- Trigger to update connector updated_at
create or replace function public.update_connector_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger connector_update_timestamp
  before update on public.connectors
  for each row
  execute function public.update_connector_updated_at();

-- Enable RLS
alter table public.connectors enable row level security;
alter table public.connector_verticals enable row level security;
alter table public.connector_health_checks enable row level security;
alter table public.connector_delivery_attempts enable row level security;
