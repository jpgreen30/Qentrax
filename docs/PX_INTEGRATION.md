# PX (px.com) integration

Qentrax treats [PX API Specs](https://api.px.com/) as a first-class **buyer delivery protocol** for a future PX client relationship.

## Protocol

PX uses **ping / post** (API 2.0 on `https://leadapi.px.com`):

| Step | Lead URL | Call URL |
|---|---|---|
| Ping (no PII) | `POST /api/lead/ping` | `POST /api/call/ping` |
| Post (full contact) | `POST /api/lead/post` | `POST /api/call/post` |
| Match ping (brand consent) | `POST /api/lead/matchping` | — |

Success response shape (2.0):

```json
{
  "TransactionId": "…",
  "Success": true,
  "Payout": 8.5,
  "Environment": "Testing",
  "Legs": [{ "Hash": "…", "Payout": 12.34, "Status": "Success" }]
}
```

Staging force-success zip: **90100** (per PX docs).

## Qentrax mapping

Table `px_vertical_maps` links Qentrax vertical/product codes → PX vertical + paths.

Seeded coverage includes: auto, health, home, life, mortgage, solar, credit-repair (lead + call), debt, personal-loan, legal, tv-phone-internet, education.

## Code

| Module | Role |
|---|---|
| `src/lib/integrations/px/client.ts` | HTTP client + response normalize |
| `src/lib/integrations/px/mapper.ts` | Opportunity → PX ping/post body |
| `GET /api/v1/integrations/px/verticals` | List maps |
| `POST /api/v1/integrations/px/ping` | Dry-run (default) or live ping |

### Dry-run example

```http
POST /api/v1/integrations/px/ping
Content-Type: application/json

{
  "organization_id": "…",
  "dry_run": true,
  "opportunity": {
    "verticalCode": "auto_insurance",
    "zip": "90210",
    "state": "CA",
    "tcpaText": "I agree to be contacted…",
    "source": "qentrax-demo"
  }
}
```

### Live ping (requires PX token)

```json
{
  "organization_id": "…",
  "api_token": "{PX_API_TOKEN}",
  "dry_run": false,
  "opportunity": { "verticalCode": "auto", "zip": "90100" }
}
```

## Delivery path (Phase 4 worker)

When a winning campaign endpoint `type = px_ping_post`:

1. Map opportunity → PX ping (strip PII)
2. If `Success` and payout ≥ floor → PX post with `TransactionId` + contact
3. Record `deliveries` + reason codes from PX `Errors` / `Message`
4. Optional: `Lead.RejectWinner` lost-bid feedback to PX

Credentials stay in `organization_integrations` + secret store (`credentials_secret_ref`); never in campaign JSON.

## Owner actions when PX engages

1. PX issues publisher API token + vertical list
2. Create `organization_integrations` row (`provider=px`, env testing)
3. Certify with zip `90100` / PX test mode
4. Flip environment to `production` after PX approval
5. Attach campaign endpoints with `type=px_ping_post`

## References

- https://api.px.com/
- https://support.px.com/hc/en-us/articles/115007764708-Ping-post-instructions
- Credit repair calls: https://api.px.com/v2/verticals/credit-repair/ping-post-calls-credit-repair/
