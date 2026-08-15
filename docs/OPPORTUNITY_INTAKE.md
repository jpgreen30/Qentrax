# Opportunity intake & field validation

`POST /api/v1/opportunities` validates every submission against `vertical_field_schemas` for the chosen vertical.

## Required body

```json
{
  "source_id": "uuid",
  "vertical": "auto_insurance",
  "product": "standard",
  "external_submission_id": "publisher-unique-id",
  "attributes": {
    "zip": "90210",
    "state": "CA",
    "currently_insured": true,
    "tcpa_consent": true,
    "source": "web-form"
  },
  "consumer": {
    "first_name": "Alex",
    "last_name": "Rivera",
    "email": "alex@example.com",
    "phone": "3105550199",
    "city": "Los Angeles"
  },
  "consent": {
    "tcpa_text": "I agree to be contacted…",
    "jornaya_lead_id": "optional-guid",
    "trustedform_url": "optional-url"
  }
}
```

## Rules

1. `vertical` must exist and be active (primary set preferred).
2. All **required ping** fields must be present and type-correct.
3. All **required post** fields must be present unless `ping_only: true`.
4. Enum fields must match `enum_values_json`.
5. Consent: `tcpa_consent` true and/or non-empty `tcpa_text`.
6. On success, non-PII ping fields are stored on `opportunities.ping_attributes` for matching.

## Error shape

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Opportunity failed vertical field validation.",
    "details": {
      "reason_code": "SCHEMA_INVALID",
      "issues": [
        { "field": "zip", "phase": "ping", "code": "MISSING", "message": "…" }
      ]
    }
  }
}
```

## Demo path

Publisher workspace **Submit test lead** posts a valid `auto_insurance` payload (CA 90210) then runs `run_minimal_auction`.
