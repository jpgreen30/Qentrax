# Canonical verticals & standard fields

Qentrax’s primary demand categories are the high-volume, **standard-field** verticals used across PX-style ping/post networks. A PX API token is **not** required to operate the marketplace; PX field names are optional aliases for future delivery.

## Primary verticals

| Code | Name | Example products |
|---|---|---|
| `life_insurance` | Life insurance | term, whole |
| `personal_loans` | Personal loans | unsecured |
| `auto_insurance` | Auto insurance | standard, non_standard |
| `solar` | Solar | residential |
| `home_services` | Home services | roofing, hvac, windows |
| `legal` | Legal | personal_injury, mass_tort |
| `real_estate` | Real estate | buyer, seller |

## Field model

Stored in `vertical_field_schemas`:

- **phase `ping`** — non-PII attributes used for matching/auction (zip, state, intent, credit band, etc.)
- **phase `post`** — contact + consent proof (name, email, phone, TCPA text, Jornaya/TrustedForm)

Common post block across all primary verticals:

- `first_name`, `last_name`, `email`, `phone`
- `address1`, `city` (required on solar / home services)
- `tcpa_text` (required)
- optional `jornaya_lead_id`, `trustedform_url`

Common ping block:

- `zip`, `state` (required)
- `tcpa_consent` (required boolean)
- `source` (optional)
- vertical-specific qualifiers (loan amount, currently insured, homeowner, case type, buy/sell intent, …)

## API

```http
GET /api/v1/verticals
GET /api/v1/verticals?fields=1
GET /api/v1/verticals?code=auto_insurance&fields=1
```

## Opportunity intake

Publishers submit `vertical` + attributes matching the schema. Q-Shield and auction use **ping-phase** fields only; contact is held until a winning buyer is selected, then delivered on **post-phase** mapping (webhook or PX adapter).

## PX later

When a PX token is available, `px_field` aliases + `src/lib/integrations/px` map the same schemas onto `leadapi.px.com` ping/post without changing publisher contracts.
