# Implementation status

Last updated: 2026-08-15 (Phase 7 delivery retry worker)

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
| 7 Hardening | **In progress** | Delivery retry worker + SLA live; load tests / Sentry still open |

## Delivery retry (Phase 7)

| Surface | Status |
|---|---|
| HTTP POST + simulate fallback | **Live** |
| Persist attempts on `deliveries` | **Live** |
| Retry queue (`next_attempt_at`) | **Live** |
| Worker cron `/api/cron/deliveries` | **Live** (every 2 min via vercel.json) |
| Backoff + max_attempts + sla_due_at | **Live** |
| Admin Network delivery pulse | **Live** |

### Retry policy

- Retry on: timeout, network error, HTTP 408/429/5xx
- Terminal on: HTTP 2xx (success), other 4xx
- Backoff: 30s × 4^(attempt-1), cap 1h
- Default max attempts: 5
- Default SLA window: 30 minutes from first attempt

### Cron auth

```
Authorization: Bearer $CRON_SECRET
# or
x-cron-secret: $CRON_SECRET
```

## Stripe Connect

| Surface | Status |
|---|---|
| Advertiser Checkout funding | **Live** |
| Webhook → `record_stripe_funding` | **Live** (test proven) |
| Publisher Express onboarding | **Live** |
| Transfer on batch release | **Live** |

### Required env

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
SUPABASE_SERVICE_ROLE_KEY=...
CRON_SECRET=...
NEXT_PUBLIC_SITE_URL=https://qentrax.vercel.app
```

## Owner remaining for production money

See `docs/LAUNCH_CHECKLIST.md`.
