begin;

-- reject_published_schema_field_change() blocked writes when the owning schema
-- version was not a draft, and treated a missing version the same way. During a
-- cascade from deleting a draft version, the parent row is already gone when the
-- row trigger fires on vertical_fields, so the cascade raised
-- "schema version ... is missing, not draft" and a draft version could never be
-- deleted at all.
--
-- A missing parent means the version is being removed and its fields are going
-- with it; there is nothing left to protect. Deletes are allowed in that case.
-- Inserts and updates still require a live draft, so a field cannot be attached
-- to a version that does not exist.

create or replace function public.reject_published_schema_field_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status public.schema_version_status;
  v_version_id uuid;
  v_found boolean;
begin
  v_version_id := coalesce(new.schema_version_id, old.schema_version_id);

  select vsv.status into v_status
  from public.vertical_schema_versions vsv
  where vsv.id = v_version_id;

  v_found := found;

  if not v_found then
    -- Cascade from deleting the version itself.
    if tg_op = 'DELETE' then
      return old;
    end if;
    raise exception 'schema version % does not exist', v_version_id
      using errcode = 'foreign_key_violation';
  end if;

  if v_status <> 'draft' then
    raise exception
      'schema version % is %, not draft; publish a new version to change fields',
      v_version_id, v_status
      using errcode = 'restrict_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

commit;
