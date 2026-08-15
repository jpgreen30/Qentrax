# Implementation status

Last updated: 2026-08-15 (E2E pass + publisher dashboard routes)

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 0 Foundation | **Complete** | Auth, RLS, magic-link, bootstrap |
| Marketing site | **Complete** | Design system + dashboard previews |
| 1 Accounts | **Live** | Org register, admin approve, memberships |
| 2 Campaigns/funding | **Live (test)** | Draft/activate, vertical + state targeting, test ledger funding |
| 3 Sources/intake | **Live** | Sources + schema-validated opportunity intake |
| 4 Marketplace | **Live (in-DB)** | Multi-candidate auction, delivery record, billable txn + journals |
| 5 Attribution | **Live (API)** | `POST /api/v1/conversions` + `record_conversion_event` |
| 6 Returns/payouts | Partial | Publisher payable ledger exists; batch payout UI not started |
| 7 Hardening | Not started | Load tests, real endpoint HTTP worker, Stripe prod |

## Primary verticals

life_insurance, personal_loans, auto_insurance, solar, home_services, legal, real_estate  
(with ping/post field schemas)

## Key RPCs

- `register_organization`
- `record_test_funding`
- `activate_campaign_if_ready`
- `run_minimal_auction` (enhanced ranking + budgets + state filter)
- `record_conversion_event`

## Publisher / Advertiser workspace

- Overview, Sources, Opportunities, Earnings, Reports (chart + funnel), Team
- Advertiser: Campaigns, Opportunities (disposition), Billing, Reports, Team
- Fonts enlarged for dashboard stats / tables (dashStats, tableHead)

## Owner remaining for production money

1. Stripe live keys + webhook → replace test funding  
2. Buyer endpoint HTTP worker (today: simulated accept)  
3. PX API token when client onboarded  
4. Counsel agreements / KYB  
