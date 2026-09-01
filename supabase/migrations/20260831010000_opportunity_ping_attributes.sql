begin;

-- Opportunity list pages and intake docs expect non-PII ping fields on the
-- opportunity row (state, zip, roof_type, …). The column was referenced in
-- application code and docs but never added, so advertiser/publisher
-- opportunity queries failed and the UI fell back to an internal uuid prefix
-- instead of the public QL- id.

alter table public.opportunities
  add column if not exists ping_attributes jsonb not null default '{}'::jsonb;

comment on column public.opportunities.ping_attributes is
  'Non-PII ping fields used for matching and workspace display. Contact PII stays out of this bag.';

commit;
