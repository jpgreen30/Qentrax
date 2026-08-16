# Implementation status

Last updated: 2026-08-15 (Stripe Connect foundation)

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 0 Foundation | **Complete** | Auth, RLS, magic-link, bootstrap |
| Marketing site | **Complete** | Design system + dashboard previews |
| 1 Accounts | **Live** | Org register, admin approve/reject/suspend/reinstate |
| 2 Campaigns/funding | **Live** | Draft/activate + **Stripe Checkout funding** (webhook → ledger) |
| 3 Sources/intake | **Live** | Sources + schema-validated opportunity intake |
| 4 Marketplace | **Live (in-DB)** | Multi-candidate auction, delivery record, billable txn + journals |
| 5 Attribution | **Live (API)** | `POST /api/v1/conversions` + `record_conversion_event` |
| 6 Returns/payouts | **Live** | Batches + Net-N schedule + **Connect transfer-on-release** |
| 7 Hardening | Partial | Stripe webhook + Connect onboard; load tests / SLA worker still open |

## Stripe Connect

| Surface | Status |
|---|---|
| Advertiser Checkout funding | **Live** — `/workspace/advertiser/billing` |
| Webhook → `record_stripe_funding` | **Live** — `POST /api/stripe/webhook` |
| Publisher Express onboarding | **Live** — `/workspace/publisher/earnings` |
| `account.updated` sync | **Live** |
| Transfer on batch release | **Live** (skips pubs without payouts_enabled) |
| Platform application fees | Config stub (`STRIPE_PLATFORM_FEE_BPS`) |

### Required env

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SITE_URL=https://qentrax.vercel.app
```

Webhook endpoint to register in Stripe Dashboard:
`https://qentrax.vercel.app/api/stripe/webhook`

Events: `checkout.session.completed`, `payment_intent.succeeded`, `account.updated`

## Admin portal

- Approvals queue (KYB approve/reject)
- Network (GMV, margin, live txns, intake)
- Organizations directory + suspend/reinstate
- Finance — batches, schedule, transfer status on release
- Audit — append-only event stream

## Owner remaining for production money

1. Stripe **live** keys + Connect platform profile complete  
2. Buyer endpoint HTTP retry worker / SLA  
3. PX API token when client onboarded  
4. Counsel agreements / KYB provider  
5. Tax form collection before first payout (1099)  
