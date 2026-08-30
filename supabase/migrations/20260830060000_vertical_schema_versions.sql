begin;

-- Phase 1: versioned vertical schemas and canonical field definitions.
--
-- verticals.field_schema_json holds an unversioned JSON blob, so there is no way
-- to publish a schema, freeze it, or record which schema governed a historical
-- lead. These tables make the schema a first-class versioned object: a vertical
-- has many schema versions, each with ordered field definitions, and publishing
-- freezes a version so historical transactions keep resolving against the exact
-- shape they were validated under.

create type public.schema_version_status as enum ('draft', 'published', 'archived');

create type public.vertical_field_type as enum (
  'text', 'textarea', 'integer', 'decimal', 'boolean',
  'date', 'datetime', 'enum', 'multi_enum',
  'phone', 'email', 'zip', 'url'
);

-- Which side of the ping/post exchange a field participates in.
create type public.field_phase as enum ('ping', 'post', 'both');

-- Consent handling class, kept separate from the PII flag: a field can be
-- personally identifying without itself being consent evidence.
create type public.consent_class as enum ('none', 'consent_evidence', 'sensitive', 'regulated');

create table public.vertical_schema_versions (
  id uuid primary key default gen_random_uuid(),
  vertical_id uuid not null references public.verticals(id) on delete cascade,
  version integer not null check (version >= 1),
  status public.schema_version_status not null default 'draft',
  notes text,
  created_by uuid references public.users(id),
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vertical_id, version),
  -- A published version must record when it was published; a draft must not.
  constraint published_has_timestamp check (
    (status = 'published' and published_at is not null)
    or (status <> 'published')
  ),
  constraint draft_has_no_publish_timestamp check (
    status <> 'draft' or published_at is null
  )
);

create index vertical_schema_versions_vertical_idx
  on public.vertical_schema_versions (vertical_id, version desc);

-- At most one draft per vertical keeps the builder unambiguous.
create unique index vertical_schema_versions_one_draft
  on public.vertical_schema_versions (vertical_id)
  where status = 'draft';

create table public.vertical_fields (
  id uuid primary key default gen_random_uuid(),
  schema_version_id uuid not null
    references public.vertical_schema_versions(id) on delete cascade,
  field_key text not null,
  label text not null,
  description text,
  field_type public.vertical_field_type not null,
  required boolean not null default false,
  phase public.field_phase not null default 'post',
  is_pii boolean not null default false,
  consent_classification public.consent_class not null default 'none',
  -- Allowed values for enum / multi_enum; null for other types.
  enum_values jsonb,
  -- Type-specific validation (min, max, pattern, precision...).
  validation_json jsonb not null default '{}'::jsonb,
  default_value jsonb,
  -- Rules making this field required or visible based on another field.
  conditional_json jsonb,
  -- Inbound names accepted as this field, for publisher compatibility.
  aliases text[] not null default '{}',
  sort_order integer not null default 0,
  active_from timestamptz,
  active_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schema_version_id, field_key),
  -- Field keys are referenced by payload parsers and generated JSON Schema, so
  -- they are restricted to a stable identifier shape.
  constraint field_key_shape check (field_key ~ '^[a-z][a-z0-9_]{0,62}$'),
  -- Enum types need values; non-enum types must not carry them. Written as a
  -- CASE so the result is always true/false: a CHECK is satisfied by NULL, and
  -- jsonb_typeof(NULL) is NULL, so the obvious AND form silently admitted an
  -- enum field with no values at all.
  constraint enum_values_present check (
    case when field_type in ('enum', 'multi_enum')
      then enum_values is not null
           and jsonb_typeof(enum_values) = 'array'
           and jsonb_array_length(enum_values) > 0
      else enum_values is null
    end
  ),
  constraint active_window_ordered check (
    active_from is null or active_to is null or active_from < active_to
  )
);

create index vertical_fields_version_order_idx
  on public.vertical_fields (schema_version_id, sort_order, field_key);

---------------------------------------------------------------------------
-- Immutability. A published version is a contract: publishers integrate
-- against it and historical transactions resolve through it. Editing published
-- semantics must create a new version instead.
---------------------------------------------------------------------------

create or replace function public.reject_published_schema_field_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status public.schema_version_status;
  v_version_id uuid;
begin
  v_version_id := coalesce(new.schema_version_id, old.schema_version_id);

  select status into v_status
  from public.vertical_schema_versions
  where id = v_version_id;

  if v_status is distinct from 'draft' then
    raise exception
      'schema version % is %, not draft; publish a new version to change fields',
      v_version_id, coalesce(v_status::text, 'missing')
      using errcode = 'restrict_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create trigger vertical_fields_immutable_when_published
  before insert or update or delete on public.vertical_fields
  for each row execute function public.reject_published_schema_field_change();

create or replace function public.reject_published_schema_version_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.status = 'published' then
    -- Publishing is one-way except for archiving, which retires a version
    -- without altering the shape anything historical resolved against.
    if new.status not in ('published', 'archived') then
      raise exception 'a published schema version cannot return to %', new.status
        using errcode = 'restrict_violation';
    end if;
    if new.vertical_id is distinct from old.vertical_id
       or new.version is distinct from old.version
       or new.published_at is distinct from old.published_at then
      raise exception 'published schema version % is immutable', old.id
        using errcode = 'restrict_violation';
    end if;
  end if;

  if tg_op = 'DELETE' and old.status = 'published' then
    raise exception 'published schema version % cannot be deleted', old.id
      using errcode = 'restrict_violation';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

create trigger vertical_schema_versions_immutable
  before update on public.vertical_schema_versions
  for each row execute function public.reject_published_schema_version_change();

create or replace function public.reject_published_schema_version_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.status = 'published' then
    raise exception 'published schema version % cannot be deleted', old.id
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$function$;

create trigger vertical_schema_versions_no_delete_published
  before delete on public.vertical_schema_versions
  for each row execute function public.reject_published_schema_version_delete();

---------------------------------------------------------------------------
-- Publishing. Assigns the next version number and freezes the draft.
---------------------------------------------------------------------------

create or replace function public.publish_vertical_schema_version(p_version_id uuid)
returns public.vertical_schema_versions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.vertical_schema_versions;
  v_field_count integer;
begin
  select * into v_row
  from public.vertical_schema_versions
  where id = p_version_id
  for update;

  if not found then
    raise exception 'schema version % not found', p_version_id
      using errcode = 'no_data_found';
  end if;

  if v_row.status <> 'draft' then
    raise exception 'schema version % is %, only a draft can be published',
      p_version_id, v_row.status
      using errcode = 'restrict_violation';
  end if;

  select count(*) into v_field_count
  from public.vertical_fields where schema_version_id = p_version_id;

  if v_field_count = 0 then
    raise exception 'schema version % has no fields to publish', p_version_id
      using errcode = 'restrict_violation';
  end if;

  update public.vertical_schema_versions
  set status = 'published', published_at = now()
  where id = p_version_id
  returning * into v_row;

  return v_row;
end;
$function$;

-- Opens a new draft seeded from the newest version's fields, which is how an
-- edit to published semantics is made.
create or replace function public.create_vertical_schema_draft(
  p_vertical_id uuid,
  p_created_by uuid default null,
  p_notes text default null
)
returns public.vertical_schema_versions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source uuid;
  v_next integer;
  v_row public.vertical_schema_versions;
begin
  if exists (select 1 from public.vertical_schema_versions
             where vertical_id = p_vertical_id and status = 'draft') then
    raise exception 'vertical % already has an open draft', p_vertical_id
      using errcode = 'restrict_violation';
  end if;

  select coalesce(max(version), 0) + 1 into v_next
  from public.vertical_schema_versions where vertical_id = p_vertical_id;

  select id into v_source
  from public.vertical_schema_versions
  where vertical_id = p_vertical_id and status = 'published'
  order by version desc limit 1;

  insert into public.vertical_schema_versions (vertical_id, version, status, notes, created_by)
  values (p_vertical_id, v_next, 'draft', p_notes, p_created_by)
  returning * into v_row;

  if v_source is not null then
    insert into public.vertical_fields (
      schema_version_id, field_key, label, description, field_type, required, phase,
      is_pii, consent_classification, enum_values, validation_json, default_value,
      conditional_json, aliases, sort_order, active_from, active_to
    )
    select v_row.id, field_key, label, description, field_type, required, phase,
           is_pii, consent_classification, enum_values, validation_json, default_value,
           conditional_json, aliases, sort_order, active_from, active_to
    from public.vertical_fields where schema_version_id = v_source;
  end if;

  return v_row;
end;
$function$;

---------------------------------------------------------------------------
-- Row-level security. Schemas are network reference data: any authenticated
-- member may read a published version; only platform admins write.
---------------------------------------------------------------------------

alter table public.vertical_schema_versions enable row level security;
alter table public.vertical_fields enable row level security;

create policy vertical_schema_versions_read on public.vertical_schema_versions
  for select to authenticated
  using (status = 'published' or public.is_platform_admin());

create policy vertical_schema_versions_admin_write on public.vertical_schema_versions
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy vertical_fields_read on public.vertical_fields
  for select to authenticated
  using (
    exists (
      select 1 from public.vertical_schema_versions v
      where v.id = schema_version_id
        and (v.status = 'published' or public.is_platform_admin())
    )
  );

create policy vertical_fields_admin_write on public.vertical_fields
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke all on function public.publish_vertical_schema_version(uuid) from public;
grant execute on function public.publish_vertical_schema_version(uuid) to authenticated, service_role;
revoke all on function public.create_vertical_schema_draft(uuid, uuid, text) from public;
grant execute on function public.create_vertical_schema_draft(uuid, uuid, text) to authenticated, service_role;

commit;
