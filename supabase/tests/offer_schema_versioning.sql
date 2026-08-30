-- Phases 1-2: versioned vertical schemas and offers. The contract under test is
-- that publishing freezes a version, so a published schema or offer cannot be
-- edited in place and historical leads keep resolving against what they were
-- validated under.
\set ON_ERROR_STOP on
set search_path = public;

begin;

insert into verticals (id, code, name) values
  ('10000000-0000-0000-0000-000000000001','solar_t','Solar');
insert into organizations (id, type, legal_name) values
  ('20000000-0000-0000-0000-000000000002','platform','Qentrax');

do $$
declare
  v_draft vertical_schema_versions;
  v_pub vertical_schema_versions;
  v_draft2 vertical_schema_versions;
  v_offer uuid := '30000000-0000-0000-0000-000000000003';
  v_ov offer_versions;
  v_ov2 offer_versions;
  v_count int;
  v_err text;
begin
  ---------------------------------------------------------------------------
  -- Draft creation and field authoring.
  ---------------------------------------------------------------------------
  v_draft := create_vertical_schema_draft('10000000-0000-0000-0000-000000000001', null, 'initial');
  if v_draft.version <> 1 or v_draft.status <> 'draft' then
    raise exception 'first draft should be version 1 draft, got % %', v_draft.version, v_draft.status;
  end if;

  -- Only one open draft per vertical.
  begin
    perform create_vertical_schema_draft('10000000-0000-0000-0000-000000000001');
    raise exception 'a second concurrent draft should have been rejected';
  exception when restrict_violation then null;
  end;

  -- An empty version cannot be published.
  begin
    perform publish_vertical_schema_version(v_draft.id);
    raise exception 'publishing a fieldless schema version should be rejected';
  exception when restrict_violation then null;
  end;

  insert into vertical_fields (schema_version_id, field_key, label, field_type, required, phase, is_pii, sort_order)
  values
    (v_draft.id, 'zip', 'ZIP', 'zip', true, 'ping', false, 1),
    (v_draft.id, 'email', 'Email', 'email', true, 'post', true, 2);

  insert into vertical_fields (schema_version_id, field_key, label, field_type, enum_values, sort_order)
  values (v_draft.id, 'roof_type', 'Roof type', 'enum', '["shingle","tile","metal"]'::jsonb, 3);

  ---------------------------------------------------------------------------
  -- Field-level constraints.
  ---------------------------------------------------------------------------
  begin
    insert into vertical_fields (schema_version_id, field_key, label, field_type)
    values (v_draft.id, 'Bad Key', 'Bad', 'text');
    raise exception 'a non-identifier field key should be rejected';
  exception when check_violation then null;
  end;

  begin
    insert into vertical_fields (schema_version_id, field_key, label, field_type)
    values (v_draft.id, 'no_values', 'No values', 'enum');
    raise exception 'an enum field with no values should be rejected';
  exception when check_violation then null;
  end;

  begin
    insert into vertical_fields (schema_version_id, field_key, label, field_type, enum_values)
    values (v_draft.id, 'not_enum', 'Not enum', 'text', '["a"]'::jsonb);
    raise exception 'enum values on a non-enum field should be rejected';
  exception when check_violation then null;
  end;

  begin
    insert into vertical_fields (schema_version_id, field_key, label, field_type)
    values (v_draft.id, 'zip', 'Duplicate', 'text');
    raise exception 'a duplicate field key within a version should be rejected';
  exception when unique_violation then null;
  end;

  ---------------------------------------------------------------------------
  -- Publishing freezes the version.
  ---------------------------------------------------------------------------
  v_pub := publish_vertical_schema_version(v_draft.id);
  if v_pub.status <> 'published' or v_pub.published_at is null then
    raise exception 'publish did not mark the version published with a timestamp';
  end if;

  begin
    update vertical_fields set label = 'Edited' where schema_version_id = v_pub.id;
    raise exception 'editing a field on a published version should be rejected';
  exception when restrict_violation then null;
  end;

  begin
    insert into vertical_fields (schema_version_id, field_key, label, field_type)
    values (v_pub.id, 'sneaky', 'Sneaky', 'text');
    raise exception 'adding a field to a published version should be rejected';
  exception when restrict_violation then null;
  end;

  begin
    delete from vertical_fields where schema_version_id = v_pub.id;
    raise exception 'deleting a field from a published version should be rejected';
  exception when restrict_violation then null;
  end;

  begin
    delete from vertical_schema_versions where id = v_pub.id;
    raise exception 'deleting a published version should be rejected';
  exception when restrict_violation then null;
  end;

  begin
    update vertical_schema_versions set status = 'draft' where id = v_pub.id;
    raise exception 'reverting a published version to draft should be rejected';
  exception when restrict_violation then null;
  end;

  begin
    perform publish_vertical_schema_version(v_pub.id);
    raise exception 'republishing an already-published version should be rejected';
  exception when restrict_violation then null;
  end;

  ---------------------------------------------------------------------------
  -- Editing published semantics opens a new version seeded from the old one.
  ---------------------------------------------------------------------------
  v_draft2 := create_vertical_schema_draft('10000000-0000-0000-0000-000000000001', null, 'v2');
  if v_draft2.version <> 2 then
    raise exception 'second draft should be version 2, got %', v_draft2.version;
  end if;

  select count(*) into v_count from vertical_fields where schema_version_id = v_draft2.id;
  if v_count <> 3 then
    raise exception 'new draft should copy the 3 published fields, got %', v_count;
  end if;

  -- The new draft is editable and the published version is untouched.
  update vertical_fields set label = 'Postal code'
    where schema_version_id = v_draft2.id and field_key = 'zip';

  if (select label from vertical_fields where schema_version_id = v_pub.id and field_key = 'zip')
     <> 'ZIP' then
    raise exception 'editing the draft mutated the published version';
  end if;

  ---------------------------------------------------------------------------
  -- Offers.
  ---------------------------------------------------------------------------
  insert into offers (id, vertical_id, name, slug, status)
  values (v_offer, '10000000-0000-0000-0000-000000000001',
          'California Solar Exclusive', 'ca-solar-exclusive', 'draft');

  begin
    insert into offers (vertical_id, name, slug)
    values ('10000000-0000-0000-0000-000000000001', 'Bad slug', 'Not A Slug');
    raise exception 'an invalid offer slug should be rejected';
  exception when check_violation then null;
  end;

  -- Pricing inputs must match the pricing mode.
  begin
    insert into offer_versions (offer_id, version, schema_version_id, lead_type, pricing_mode)
    values (v_offer, 99, v_pub.id, 'exclusive', 'fixed');
    raise exception 'a fixed-price offer with no price should be rejected';
  exception when check_violation then null;
  end;

  begin
    insert into offer_versions (offer_id, version, schema_version_id, lead_type, pricing_mode, floor_cents, ceiling_cents)
    values (v_offer, 98, v_pub.id, 'exclusive', 'floor', 5000, 1000);
    raise exception 'a ceiling below the floor should be rejected';
  exception when check_violation then null;
  end;

  insert into offer_versions (
    offer_id, version, schema_version_id, lead_type, pricing_mode, price_cents, geo_rules_json
  ) values (
    v_offer, 1, v_pub.id, 'exclusive', 'fixed', 4500,
    '{"states":{"include":["CA"]}}'::jsonb
  ) returning * into v_ov;

  ---------------------------------------------------------------------------
  -- An offer cannot go live against an unpublished schema.
  ---------------------------------------------------------------------------
  update offer_versions set schema_version_id = v_draft2.id where id = v_ov.id;
  begin
    perform publish_offer_version(v_ov.id);
    raise exception 'publishing against a draft schema version should be rejected';
  exception when restrict_violation then null;
  end;
  update offer_versions set schema_version_id = v_pub.id where id = v_ov.id;

  v_ov := publish_offer_version(v_ov.id);
  if v_ov.status <> 'published' then
    raise exception 'offer version should be published, got %', v_ov.status;
  end if;

  -- Publishing promotes the offer and points it at the live version.
  if (select status from offers where id = v_offer) <> 'published' then
    raise exception 'publishing a version should publish its draft offer';
  end if;
  if (select current_version_id from offers where id = v_offer) <> v_ov.id then
    raise exception 'offer current_version_id was not set to the published version';
  end if;

  ---------------------------------------------------------------------------
  -- Published offer terms are frozen.
  ---------------------------------------------------------------------------
  begin
    update offer_versions set price_cents = 1 where id = v_ov.id;
    raise exception 'repricing a published offer version should be rejected';
  exception when restrict_violation then null;
  end;

  begin
    update offer_versions set geo_rules_json = '{}'::jsonb where id = v_ov.id;
    raise exception 'changing published geo rules should be rejected';
  exception when restrict_violation then null;
  end;

  begin
    update offer_versions set schema_version_id = v_draft2.id where id = v_ov.id;
    raise exception 'repointing a published offer at another schema should be rejected';
  exception when restrict_violation then null;
  end;

  begin
    delete from offer_versions where id = v_ov.id;
    raise exception 'deleting a published offer version should be rejected';
  exception when restrict_violation then null;
  end;

  ---------------------------------------------------------------------------
  -- A repricing is expressed as a new version; the old one is unchanged.
  ---------------------------------------------------------------------------
  v_ov2 := create_offer_draft(v_offer, 'reprice');
  if v_ov2.version <> 2 or v_ov2.price_cents <> 4500 then
    raise exception 'draft should be version 2 seeded at 4500, got % / %',
      v_ov2.version, v_ov2.price_cents;
  end if;

  update offer_versions set price_cents = 5200 where id = v_ov2.id;
  v_ov2 := publish_offer_version(v_ov2.id);

  if (select price_cents from offer_versions where id = v_ov.id) <> 4500 then
    raise exception 'the superseded version was repriced';
  end if;
  if (select current_version_id from offers where id = v_offer) <> v_ov2.id then
    raise exception 'offer did not advance to the new published version';
  end if;

  -- Archiving is the one status change a published version still allows.
  update offer_versions set status = 'archived' where id = v_ov.id;

  raise notice 'offer_schema_versioning: PASS';
end $$;

rollback;
