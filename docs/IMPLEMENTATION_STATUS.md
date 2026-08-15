# Implementation status

Last updated: 2026-08-15 (admin Finance + Audit + org controls)

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 0 Foundation | **Complete** | Auth, RLS, magic-link, bootstrap |
| Marketing site | **Complete** | Design system + dashboard previews |
| 1 Accounts | **Live** | Org register, admin approve/reject/suspend/reinstate |
| 2 Campaigns/funding | **Live (test)** | Draft/activate, vertical + state targeting, test ledger funding |
| 3 Sources/intake | **Live** | Sources + schema-validated opportunity intake |
| 4 Marketplace | **Live (in-DB)** | Multi-candidate auction, delivery record, billable txn + journals |
| 5 Attribution | **Live (API)** | `POST /api/v1/conversions` + `record_conversion_event` |
| 6 Returns/payouts | **UI live** | Payout batches create → approve → release; Net-30 rails later |
| 7 Hardening | Not started | Load tests, real endpoint HTTP worker, Stripe prod |

## Admin portal

- Approvals queue (KYB approve/reject)
- Network (GMV, margin, live txns, intake)
- Organizations directory + **suspend/reinstate** (reason required)
- **Finance** — eligible payables, payout batch create/approve/release/cancel
- **Audit** — append-only event stream with action mix

## Migration required

Apply `supabase/migrations/20260815220000_payout_batches.sql` in the Supabase SQL editor (or CLI) so Finance batch create works against `payout_batches` / `payout_items`.

## Owner remaining for production money

1. Stripe live keys + webhook → replace test funding  
2. Buyer endpoint HTTP worker (today: simulated accept)  
3. PX API token when client onboarded  
4. Counsel agreements / KYB  
5. Net-30 eligibility filter + tax/bank readiness on release  
