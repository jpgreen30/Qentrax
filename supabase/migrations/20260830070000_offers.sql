begin;

-- Phase 2: the Offer domain.
--
-- Qentrax modelled Campaign but never Offer, so there was nothing for an
-- advertiser to browse and nothing carrying the network's sell-side terms. An
-- Offer is what the network publishes (what is for sale, under what rules); a
-- Campaign is an advertiser's buy against one. Offers are versioned on the same
-- contract as vertical schemas: a published version is frozen, and editing
-- published terms opens a new draft.

create type public.offer_status as enum ('draft', 'published', 'paused', 'archived');

create type public.lead_type as enum (
  'exclusive', 'shared', 'form', 'call', 'appointment', 'transfer'
);

create type public.offer_pricing_mode as enum (
  'fixed', 'floor', 'bid', 'auction', 'ping_post'
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  vertical_id uuid not null references public.verticals(id),
  product_id uuid references public.products(id),
  -- The organization accountable for the offer. Null means platform-owned.
  owner_org_id uuid references public.organizations(id),
  name text not null,
  slug text not null unique,
  description text,
  status public.offer_status not null default 'draft',
  created_by uuid references public.users(id),
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offer_slug_shape check (slug ~ '^[a-z0-9][a-z0-9-]{1,80}$')
);

create index offers_vertical_status_idx on public.offers (vertical_id, status);

create table public.offer_versions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  version integer not null check (version >= 1),
  status public.schema_version_status not null default 'draft',

  -- The vertical schema version this offer's payload contract resolves
  -- against. Frozen at publish so a historical lead keeps its exact shape.
  schema_version_id uuid not null references public.vertical_schema_versions(id),

  lead_type public.lead_type not null,
  pricing_mode public.offer_pricing_mode not null,
  -- Money is integer cents throughout.
  price_cents integer check (price_cents is null or price_cents >= 0),
  floor_cents integer check (floor_cents is null or floor_cents >= 0),
  ceiling_cents integer check (ceiling_cents is null or ceiling_cents >= 0),

  -- Geography include/exclude rules, e.g. {"states":{"include":["CA"]}}.
  geo_rules_json jsonb not null default '{}'::jsonb,
  -- Quality, consent, verification and eligibility requirements.
  requirements_json jsonb not null default '{}'::jsonb,
  -- Return window and accepted return reasons.
  return_policy_json jsonb not null default '{}'::jsonb,
  -- Per-offer field overrides layered on the canonical vertical fields.
  field_config_json jsonb not null default '{}'::jsonb,

  max_lead_age_seconds integer check (max_lead_age_seconds is null or max_lead_age_seconds > 0),
  notes text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (offer_id, version),

  -- A fixed-price offer needs a price; bid/auction/floor modes need a floor.
  constraint pricing_inputs_present check (
    (pricing_mode = 'fixed' and price_cents is not null)
    or (pricing_mode in ('floor', 'bid', 'auction') and floor_cents is not null)
    or (pricing_mode = 'ping_post')
  ),
  constraint ceiling_above_floor check (
    ceiling_cents is null or floor_cents is null or ceiling_cents >= floor_cents
  ),
  constraint offer_published_has_timestamp check (
    status <> 'published' or published_at is not null
  )
);

create index offer_versions_offer_idx on public.offer_versions (offer_id, version desc);

create unique index offer_versions_one_draft
  on public.offer_versions (offer_id) where status = 'draft';

-- The version currently serving traffic. Set on publish, cleared on archive.
alter table public.offers
  add column current_version_id uuid references public.offer_versions(id);

---------------------------------------------------------------------------
-- Immutability of published offer versions.
---------------------------------------------------------------------------

create or replace function public.reject_published_offer_version_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    if old.status = 'published' then
      raise exception 'published offer version % cannot be deleted', old.id
        using errcode = 'restrict_violation';
    end if;
    return old;
  end if;

  if old.status = 'published' then
    if new.status not in ('published', 'archived') then
      raise exception 'a published offer version cannot return to %', new.status
        using errcode = 'restrict_violation';
    end if;
    -- Everything that defines the commercial contract is frozen.
    if new.schema_version_id is distinct from old.schema_version_id
       or new.lead_type is distinct from old.lead_type
       or new.pricing_mode is distinct from old.pricing_mode
       or new.price_cents is distinct from old.price_cents
       or new.floor_cents is distinct from old.floor_cents
       or new.ceiling_cents is distinct from old.ceiling_cents
       or new.geo_rules_json is distinct from old.geo_rules_json
       or new.requirements_json is distinct from old.requirements_json
       or new.return_policy_json is distinct from old.return_policy_json
       or new.field_config_json is distinct from old.field_config_json
       or new.max_lead_age_seconds is distinct from old.max_lead_age_seconds
       or new.version is distinct from old.version
       or new.published_at is distinct from old.published_at then
      raise exception 'published offer version % is immutable; create a new draft', old.id
        using errcode = 'restrict_violation';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

create trigger offer_versions_immutable
  before update on public.offer_versions
  for each row execute function public.reject_published_offer_version_change();

create trigger offer_versions_no_delete_published
  before delete on public.offer_versions
  for each row execute function public.reject_published_offer_version_change();

---------------------------------------------------------------------------
-- Publish / draft lifecycle.
---------------------------------------------------------------------------

create or replace function public.publish_offer_version(p_version_id uuid)
returns public.offer_versions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.offer_versions;
  v_schema_status public.schema_version_status;
begin
  select * into v_row from public.offer_versions where id = p_version_id for update;
  if not found then
    raise exception 'offer version % not found', p_version_id using errcode = 'no_data_found';
  end if;
  if v_row.status <> 'draft' then
    raise exception 'offer version % is %, only a draft can be published',
      p_version_id, v_row.status using errcode = 'restrict_violation';
  end if;

  -- An offer must not go live against an unpublished schema; publishers would
  -- be integrating against a contract that can still change underneath them.
  select status into v_schema_status
  from public.vertical_schema_versions where id = v_row.schema_version_id;

  if v_schema_status is distinct from 'published' then
    raise exception
      'offer version % references schema version %, which is %, not published',
      p_version_id, v_row.schema_version_id, coalesce(v_schema_status::text, 'missing')
      using errcode = 'restrict_violation';
  end if;

  update public.offer_versions
  set status = 'published', published_at = now()
  where id = p_version_id
  returning * into v_row;

  update public.offers
  set status = case when status = 'draft' then 'published' else status end,
      current_version_id = v_row.id,
      published_at = coalesce(published_at, now()),
      updated_at = now()
  where id = v_row.offer_id;

  return v_row;
end;
$function$;

create or replace function public.create_offer_draft(
  p_offer_id uuid,
  p_notes text default null
)
returns public.offer_versions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source public.offer_versions;
  v_next integer;
  v_row public.offer_versions;
begin
  if exists (select 1 from public.offer_versions
             where offer_id = p_offer_id and status = 'draft') then
    raise exception 'offer % already has an open draft', p_offer_id
      using errcode = 'restrict_violation';
  end if;

  select coalesce(max(version), 0) + 1 into v_next
  from public.offer_versions where offer_id = p_offer_id;

  select * into v_source from public.offer_versions
  where offer_id = p_offer_id and status = 'published'
  order by version desc limit 1;

  if not found then
    raise exception 'offer % has no published version to copy', p_offer_id
      using errcode = 'no_data_found';
  end if;

  insert into public.offer_versions (
    offer_id, version, status, schema_version_id, lead_type, pricing_mode,
    price_cents, floor_cents, ceiling_cents, geo_rules_json, requirements_json,
    return_policy_json, field_config_json, max_lead_age_seconds, notes
  ) values (
    p_offer_id, v_next, 'draft', v_source.schema_version_id, v_source.lead_type,
    v_source.pricing_mode, v_source.price_cents, v_source.floor_cents,
    v_source.ceiling_cents, v_source.geo_rules_json, v_source.requirements_json,
    v_source.return_policy_json, v_source.field_config_json,
    v_source.max_lead_age_seconds, p_notes
  ) returning * into v_row;

  return v_row;
end;
$function$;

---------------------------------------------------------------------------
-- Marketplace visibility is enforced here, not in the UI: an advertiser sees
-- only offers that are actually live.
---------------------------------------------------------------------------

alter table public.offers enable row level security;
alter table public.offer_versions enable row level security;

create policy offers_marketplace_read on public.offers
  for select to authenticated
  using (
    status = 'published'
    or public.is_platform_admin()
    or (owner_org_id is not null and public.is_organization_member(owner_org_id))
  );

create policy offers_admin_write on public.offers
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy offer_versions_marketplace_read on public.offer_versions
  for select to authenticated
  using (
    (status = 'published' and exists (
      select 1 from public.offers o
      where o.id = offer_id and o.status in ('published', 'paused')
    ))
    or public.is_platform_admin()
  );

create policy offer_versions_admin_write on public.offer_versions
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke all on function public.publish_offer_version(uuid) from public;
grant execute on function public.publish_offer_version(uuid) to authenticated, service_role;
revoke all on function public.create_offer_draft(uuid, text) from public;
grant execute on function public.create_offer_draft(uuid, text) to authenticated, service_role;

commit;
