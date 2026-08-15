# Implementation status

Last updated: 2026-08-15

## Phase status

| Phase | Status | Evidence / remaining gate |
|---|---|---|
| 0 Foundation | **Complete** | Auth shell, migrations, RLS, magic-link live verified (`jpgreen1@gmail.com` → `/workspace`). |
| Public marketing site | Complete | Design parity on Vercel. |
| 1 Accounts/onboarding | **In progress — core live** | Org create + membership + profiles + agreements seed + permission matrix + `/onboarding` + workspace routing. Admin approval queue UI and KYB provider adapters remain. |
| 2 Campaigns/funding | **Scaffold live** | Campaigns, versions, endpoints, financial_accounts, journals/ledger tables + draft campaign UI/API. Stripe funding intents not wired. |
| 3 Sources/intake | **Scaffold live** | publisher_sources, consent_templates, integrations + draft source UI/API + opportunity POST skeleton. |
| 4 Marketplace/Q-Shield | **Schema + stub intake** | opportunities, validation_runs/results, auction_*, deliveries, transactions, conversion_events. Intake records validating→ready/rejected_quality; auction worker not live. |
| 5 Attribution | Schema only | conversion_events table + unique external_event_id. API worker pending. |
| 6 Returns/payouts | Not started | Payables batching pending. |
| 7 Hardening | Not started | Load/security/runbooks pending. |

## Live database (Supabase `wmrfdzkcjtceuhloerte`)

- Phase 0–4 migrations applied
- 10 roles, 48 role_permissions, 20 reason codes, 4 agreements
- 6 verticals, 19 products
- RLS on tenant tables

## App routes

- `/sign-in`, `/auth/confirm`, `/workspace`
- `/onboarding` — create advertiser/publisher org
- `/workspace/advertiser?org=` — draft campaigns
- `/workspace/publisher?org=` — draft sources
- `POST /api/v1/organizations`, `campaigns`, `sources`, `opportunities`
- `GET /api/v1/health`

## Owner blockers for money movement

- Stripe keys + webhook endpoint (Phase 2 funding)
- Counsel-approved agreement PDFs (replace seed summaries)
- KYB provider credentials
- Queue/worker deployment before live auction latency path
