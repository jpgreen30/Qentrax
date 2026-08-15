# End-to-end marketplace path

```text
Publisher source
  → POST /api/v1/opportunities (schema + consent)
  → opportunities.status = ready
  → run_minimal_auction (default)
      · match active funded campaigns (vertical + optional state targeting)
      · rank by base_bid_cents
      · simulate delivery accept
      · create billable transaction
      · ledger: charge advertiser, credit publisher payable + platform margin
  → POST /api/v1/conversions (contacted | qualified | sale | …)
```

## Demo UI path

1. Sign in → create advertiser + publisher orgs → admin approve both  
2. Advertiser: fund $500 → create campaign with **vertical** (e.g. `auto_insurance`) → activate  
3. Publisher: create source → **Submit test lead** (auto_insurance CA 90210)  
4. Both dashboards show billable activity  

## API path

```http
POST /api/v1/opportunities
{
  "source_id": "…",
  "vertical": "auto_insurance",
  "attributes": { "zip": "90210", "state": "CA", "tcpa_consent": true, … },
  "consumer": { "first_name": "…", "last_name": "…", "email": "…", "phone": "…" },
  "consent": { "tcpa_text": "…" },
  "run_auction": true
}
```

Response includes `auction` object (`billable` | `no_match` | …).

```http
POST /api/v1/conversions
{
  "organization_id": "advertiser-org",
  "transaction_id": "…",
  "event_type": "sale",
  "external_event_id": "crm-123",
  "revenue_cents": 25000
}
```

## Delivery

- After auction, if the winning campaign has an **active** `campaign_endpoints` URL, Qentrax POSTs a JSON payload to that URL.
- Missing / failing endpoints fall back to **simulated accept** (same as the original in-DB path).
- Manual replay: `POST /api/v1/deliveries` with `{ organization_id, transaction_id, endpoint_url?, simulate? }`.
- Set endpoint URL when creating a campaign (Buyer endpoint URL field).

## Still external / later

- Real Stripe webhooks (test ledger works)
- Production buyer SLA / retry worker (basic HTTP post is live)
- PX token delivery adapter
- Net-30 payout batching
- Returns / disputes workflow UI
