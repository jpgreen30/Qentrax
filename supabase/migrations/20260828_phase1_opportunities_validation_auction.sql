begin;

-- Opportunities: consumer interest from publisher
create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  public_transaction_id text not null unique,
  publisher_org_id uuid not null references public.organizations(id),
  source_id uuid not null references public.publisher_sources(id),
  vertical_id uuid not null references public.verticals(id),
  product_id uuid references public.products(id),
  external_submission_id text,
  status text not null default 'received' check(status in ('received', 'validation_pending', 'eligible', 'auction_pending', 'auctioned', 'delivered', 'returned', 'rejected')),
  consumer_token_hash text,
  normalized_payload_encrypted bytea not null,
  received_at timestamptz not null default now(),
  schema_version text not null default '1.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check(version > 0),
  unique(publisher_org_id, source_id, external_submission_id)
);

-- Consent proof for opportunity
create table if not exists public.consent_evidence (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  template_id uuid not null references public.consent_templates(id),
  proof_provider text not null,
  certificate_ref text,
  proof_hash text not null,
  captured_at timestamptz not null,
  evidence_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Validation pipeline execution
create table if not exists public.validation_runs (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade unique,
  pipeline_version text not null default '1.0',
  status text not null default 'pending' check(status in ('pending', 'in_progress', 'passed', 'failed', 'review')),
  composite_score numeric(5, 2),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Individual validation check results
create table if not exists public.validation_results (
  id uuid primary key default gen_random_uuid(),
  validation_run_id uuid not null references public.validation_runs(id) on delete cascade,
  check_code text not null,
  provider text,
  outcome text not null check(outcome in ('pass', 'fail', 'review', 'unavailable')),
  score numeric(5, 2),
  reason_code text,
  evidence_json jsonb not null default '{}',
  latency_ms integer,
  created_at timestamptz not null default now(),
  unique(validation_run_id, check_code)
);

-- Auction execution
create table if not exists public.auction_runs (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade unique,
  status text not null default 'pending' check(status in ('pending', 'in_progress', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  winning_campaign_id uuid,
  winning_bid_cents integer,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auction candidate evaluation
create table if not exists public.auction_candidates (
  id uuid primary key default gen_random_uuid(),
  auction_run_id uuid not null references public.auction_runs(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id),
  eligible boolean not null default false,
  bid_cents integer,
  rank integer,
  reason_codes_json jsonb not null default '[]',
  rule_snapshot_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(auction_run_id, campaign_id)
);

create index opportunities_publisher_org_idx on public.opportunities(publisher_org_id);
create index opportunities_source_idx on public.opportunities(source_id);
create index opportunities_vertical_idx on public.opportunities(vertical_id);
create index opportunities_status_idx on public.opportunities(status);
create index opportunities_public_txn_idx on public.opportunities(public_transaction_id);
create index consent_evidence_opportunity_idx on public.consent_evidence(opportunity_id);
create index validation_runs_opportunity_idx on public.validation_runs(opportunity_id);
create index validation_results_run_idx on public.validation_results(validation_run_id);
create index auction_runs_opportunity_idx on public.auction_runs(opportunity_id);
create index auction_candidates_auction_idx on public.auction_candidates(auction_run_id);
create index auction_candidates_campaign_idx on public.auction_candidates(campaign_id);

-- Organization-scoped RLS (publisher can see their own opportunities)
alter table public.opportunities enable row level security;
alter table public.consent_evidence enable row level security;
alter table public.validation_runs enable row level security;
alter table public.validation_results enable row level security;
alter table public.auction_runs enable row level security;
alter table public.auction_candidates enable row level security;

create policy opportunities_publisher_select on public.opportunities for select to authenticated
  using (publisher_org_id = public.org_id_from_auth());

create policy consent_evidence_publisher_select on public.consent_evidence for select to authenticated
  using (opportunity_id in (select id from public.opportunities where publisher_org_id = public.org_id_from_auth()));

create policy validation_runs_publisher_select on public.validation_runs for select to authenticated
  using (opportunity_id in (select id from public.opportunities where publisher_org_id = public.org_id_from_auth()));

create policy validation_results_publisher_select on public.validation_results for select to authenticated
  using (validation_run_id in (select id from public.validation_runs where opportunity_id in (select id from public.opportunities where publisher_org_id = public.org_id_from_auth())));

create policy auction_runs_publisher_select on public.auction_runs for select to authenticated
  using (opportunity_id in (select id from public.opportunities where publisher_org_id = public.org_id_from_auth()));

create policy auction_candidates_publisher_select on public.auction_candidates for select to authenticated
  using (auction_run_id in (select id from public.auction_runs where opportunity_id in (select id from public.opportunities where publisher_org_id = public.org_id_from_auth())));

commit;
