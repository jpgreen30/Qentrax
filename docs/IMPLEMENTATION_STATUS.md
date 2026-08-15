# Implementation status

Last updated: 2026-08-15 (automated payout scheduling + Finance UI)

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
| 6 Returns/payouts | **Live** | Batches create → approve → release; **automated Net-N schedule** (cron + config) |
| 7 Hardening | Not started | Load tests, real endpoint HTTP worker, Stripe prod |

## Admin portal

- Approvals queue (KYB approve/reject)
- Network (GMV, margin, live txns, intake)
- Organizations directory + **suspend/reinstate** (reason required)
- **Finance** — eligible payables, manual + scheduled batches, approve/release/cancel, schedule config panel
- **Audit** — append-only event stream with action mix

## Automated payout scheduling

- Table: `payout_schedule_config` (singleton id=1)
- Runner: `src/lib/payouts/schedule.ts` (`runScheduledPayout`, `computeNextRunAt`, `recordScheduleRun`)
- Cron: `GET/POST /api/cron/payouts` (Vercel cron `0 14 * * *`, protected by `CRON_SECRET`)
- UI: Finance → enable cadence (daily/weekly/biweekly/monthly), Net days, min batch, auto-approve, Run now
- Requires Vercel env: `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`

## Migrations applied

- `20260815220000_payout_batches.sql` — batches + items
- `20260815230000_payout_schedule.sql` — schedule config (applied 2026-08-15)

## Owner remaining for production money

1. Stripe live keys + webhook → replace test funding  
2. Buyer endpoint HTTP worker (today: simulated accept)  
3. PX API token when client onboarded  
4. Counsel agreements / KYB  
5. Tax/bank readiness + actual ACH/Stripe Connect on release  
