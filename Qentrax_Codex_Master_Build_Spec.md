# Qentrax — Canonical End-to-End Codex Build Specification

**Status:** Canonical implementation specification  
**Version:** 1.0  
**Date:** August 14, 2026  
**Product:** Qentrax — AI-native marketplace for consumer demand  
**Primary domain:** Qentrax.io  
**Design reference:** https://qentrax.jpgreen30.chatgpt.site

---

## 1. Purpose and source of truth

This document is the single source of truth for building the Qentrax application. Codex must implement the product described here end to end, in phased milestones, without inventing conflicting business rules.

Qentrax connects publishers that generate consumer opportunities with advertisers that buy them. Every opportunity is verified, enriched, matched, bid on, routed, delivered, dispositioned, billed and settled through a permanent transaction ledger.

The core product is not merely three dashboards. It is a marketplace and financial ledger with role-specific interfaces:

1. **Publisher workspace** — sources, integrations, opportunity activity, quality, earnings and payouts.
2. **Advertiser workspace** — campaigns, targeting, bids, budgets, funding, delivery, sales attribution and reporting.
3. **Admin workspace** — approvals, quality, compliance, routing, disputes, finance, users, configuration and audit history.

The canonical transaction chain is:

```text
Publisher source
  → intake and consent evidence
  → validation and enrichment
  → Q-Shield decision
  → eligible campaign matching
  → bid/auction
  → winning advertiser
  → delivery receipt
  → advertiser disposition and sale events
  → advertiser charge
  → publisher payable
  → payout and reconciliation
```

## 2. Product principles

- **Evidence before acceptance.** No billable opportunity without recorded validation, consent and decision evidence.
- **Rules are explicit.** Campaign and source decisions must return stable reason codes.
- **Money is ledger-driven.** Balances are derived from immutable entries, never directly overwritten.
- **Closed-loop outcomes.** Advertiser dispositions and sales feed reporting, quality scoring and future routing.
- **Registration before money.** Publishers register and complete review before monetizing. Advertisers register and configure campaigns, then fund when they are ready to launch.
- **No silent automation.** Administrative overrides, credits, suspensions and payout actions require actor attribution and audit records.
- **Idempotency everywhere.** Repeated lead submissions, webhook events, billing events and payout operations must be safe.
- **Vertical-aware behavior.** Real estate, insurance, mortgage, legal, home services and finance can have distinct fields, validation and compliance rules.

## 3. Initial scope

### 3.1 Supported verticals

- Real estate: buyer, seller and investor inquiries
- Insurance: auto, life, home and health
- Mortgage: purchase, refinance and HELOC
- Legal: personal injury, mass tort and consumer
- Home services: solar, roofing, HVAC and windows
- Finance: personal loans and business loans

Vertical definitions must be data-driven so administrators can add programs and fields without application redeployment.

### 3.2 MVP delivery modes

- REST API
- Ping/post
- Signed webhooks
- CRM delivery through adapters
- SFTP/CSV import and export
- Call transfer configuration and event capture

### 3.3 Out of scope for the first production release

- Fully autonomous campaign creation
- Cryptocurrency settlement
- Multi-currency advertiser funding
- Self-service custom rule scripting
- Public buyer identity exposure to publishers
- Automated legal determinations

## 4. Roles and permissions

Use organization-scoped RBAC. A user can belong to multiple organizations but acts within one active organization at a time.

### 4.1 Roles

| Role | Primary permissions |
|---|---|
| Advertiser owner | Organization, users, campaigns, funding, integrations, reporting |
| Advertiser manager | Campaigns, endpoints, reports; no bank or ownership changes |
| Advertiser analyst | Read-only performance and exports |
| Publisher owner | Organization, users, sources, integrations, tax/bank settings, reporting |
| Publisher manager | Sources, integrations and reports; no bank or ownership changes |
| Publisher analyst | Read-only quality, earnings and exports |
| Admin superuser | All platform operations with elevated audit requirements |
| Admin compliance | KYC/KYB, sources, consent evidence, suspensions and quality cases |
| Admin finance | Credits, advertiser reconciliation, publisher payouts and statements |
| Admin support | Account assistance and read-only transaction inspection |

### 4.2 Authorization requirements

- Every application query must scope records by organization unless the actor has an explicit admin permission.
- Sensitive admin actions require a reason and append-only audit entry.
- Support impersonation is read-only by default, prominently indicated and logged.
- Finance and payout changes require step-up authentication.
- API keys belong to organizations, have scopes, show only a prefix after creation and can be revoked.

## 5. Onboarding

### 5.1 Shared account flow

1. Register and verify email.
2. Create or join an organization.
3. Select advertiser or publisher account type.
4. Enter company identity, address, website, contacts and beneficial-owner information as required.
5. Accept applicable agreements.
6. Complete KYB/KYC review.
7. Receive approved, needs-information or rejected status.

### 5.2 Advertiser onboarding

After approval, the advertiser can:

1. Create a campaign.
2. Define targeting, eligibility, bids, budgets, schedules and caps.
3. Configure an endpoint or native integration.
4. Run test transactions.
5. Add funds through Stripe when ready to launch.
6. Request campaign activation.

The default minimum opening campaign funding amount is **$500**, applied at campaign launch—not account registration. Make this an administrator-configurable policy.

### 5.3 Publisher onboarding

After approval, the publisher can:

1. Add a source with domain/channel, acquisition method, verticals, geography and estimated volume.
2. Provide consent language, example creative and traffic provenance.
3. Complete source review.
4. Configure delivery credentials.
5. Submit controlled test opportunities.
6. Go live after approval.
7. Complete W-9/W-8 and payout details before payout release.

Publisher payment terms default to **Net 30** after reaching a **$100 minimum payable threshold**. Both values must be policy-configurable.

## 6. Core functional domains

### 6.1 Advertiser campaigns

Each campaign includes:

- Vertical and product
- Status and activation dates
- Accepted geography
- Consumer attributes and eligibility filters
- Evidence requirements
- Exclusions and duplicate policy
- Bid amount or bid strategy
- Daily/monthly budgets
- Daily/hourly caps
- Schedule and timezone
- Exclusivity and shared-lead rules
- Delivery endpoint and retry policy
- Return policy and review window
- Low-balance threshold
- Outcome webhook/integration configuration

The campaign editor must support draft saving, validation, test mode, administrative review, activation, pause, archive and version history.

### 6.2 Publisher sources

Each source includes:

- Source name, channel and owned domain/property
- Acquisition method
- Verticals and geography
- Consent mechanism and text/version
- Expected volume
- Delivery integration
- Quality thresholds
- Status and suspension reason
- Test results
- Earnings and acceptance metrics

### 6.3 Q-Shield quality and filtering

Q-Shield is a rules-and-evidence pipeline. The first implementation must support pluggable providers and deterministic internal rules.

Checks include:

- Required-field and schema validation
- Phone and email normalization/validation
- Identity consistency
- Consent proof and provenance
- Duplicate suppression across configurable windows
- IP/device/source velocity
- Geographic consistency
- Bot and anomaly signals
- Vertical eligibility
- Campaign-specific buyer fit
- Suppression lists
- Source and organization status

Every check returns `pass`, `fail`, `review` or `unavailable`, a score where applicable, evidence metadata and a stable reason code. Provider unavailability must be distinguishable from a failed consumer check.

### 6.4 Matching and auction

1. Select campaigns that are active, funded, scheduled and below caps.
2. Evaluate vertical, product, geography and buyer rules.
3. Calculate eligible bids.
4. Rank candidates by bid and configurable quality/economic adjustments.
5. Reserve campaign budget atomically.
6. Deliver to the selected buyer.
7. On eligible delivery failure, release the reservation and try the next candidate.
8. Finalize charge only after the configured acceptance condition.

Auction decisions must record eligible and ineligible campaign IDs, bid values, rank, reason codes and timing. Publishers must not see confidential buyer targeting or losing bids.

### 6.5 Delivery

- Every delivery contains a globally unique `transaction_id`.
- Delivery payloads use versioned field mappings.
- Endpoints must be signed and support timeout/retry policies.
- Store request/response metadata with secrets and sensitive fields redacted.
- Delivery receipt statuses: acknowledged, accepted, rejected, timed_out, failed.
- Rejections must use canonical reason codes plus optional buyer detail.
- Retries must never create duplicate advertiser charges.

### 6.6 Closed-loop sales and conversion tracking

Near-real-time sales tracking is a first-class advertiser capability.

Qentrax sends `transaction_id` with every delivered opportunity. Advertisers return lifecycle events through one of these methods:

1. **Server-to-server webhook/API** — primary and recommended.
2. **Native CRM adapter** — Salesforce, HubSpot and later vertical CRMs.
3. **Scheduled CSV/SFTP import** — fallback, not real time.
4. **Manual disposition entry** — exception workflow with actor audit.

Supported outcome event types:

- `received`
- `attempted_contact`
- `contacted`
- `qualified`
- `appointment_scheduled`
- `application_started`
- `application_submitted`
- `quoted`
- `sale`
- `revenue_received`
- `cancelled`
- `refunded`
- `invalid`

The advertiser dashboard must display:

- Sales today and current period
- Revenue
- Cost per acquisition
- Return on ad spend
- Lead-to-contact, lead-to-qualified and lead-to-sale rates
- Funnel by campaign, source-visible grouping, vertical and date
- Recent conversion event stream
- Unattributed or conflicting events requiring review
- Integration health, last successful event and error rate

Outcome events update reporting immediately after validation. They must not rewrite historical opportunity records.

### 6.7 Billing and payouts

Advertiser funds are collected through Stripe. Internal money movement uses a double-entry ledger.

- Stripe is the payment processor, not the accounting source of truth.
- Webhook-confirmed payment events create ledger entries.
- Campaign budget reservations prevent overspend under concurrency.
- Accepted billable transactions debit advertiser balance and create publisher payable plus platform margin.
- Returns create linked reversing/adjusting entries; no destructive mutation.
- Publisher payouts batch eligible payable entries after Net 30 and the threshold.
- Admin finance approves payout batches before release in MVP.
- Statements reconcile opening balance, activity and closing balance.

## 7. Canonical data model

Use PostgreSQL with UUID primary keys, `timestamptz`, constrained enums or reference tables, JSONB only for variable evidence/payload snapshots, and row-level access policies where appropriate. Every mutable business table includes `created_at`, `updated_at` and optimistic concurrency/version fields.

### 7.1 Identity and organizations

```text
users
  id, auth_subject, email, display_name, status, last_login_at

organizations
  id, type[advertiser|publisher|platform], legal_name, dba_name,
  website, tax_country, status, onboarding_status, risk_tier

organization_members
  id, organization_id, user_id, role_id, status, invited_by, joined_at

roles
  id, code, name

role_permissions
  role_id, permission_code

organization_profiles
  organization_id, address_json, contacts_json, beneficial_owners_json,
  kyb_provider_ref, kyb_status, reviewed_by, reviewed_at

agreements
  id, type, version, effective_at, document_url, active

agreement_acceptances
  id, agreement_id, organization_id, user_id, accepted_at, ip_hash
```

### 7.2 Publisher domain

```text
publisher_sources
  id, publisher_org_id, name, channel, domain, acquisition_method,
  estimated_monthly_volume, status, quality_score, reviewed_by, reviewed_at,
  suspension_reason_code

source_verticals
  source_id, vertical_id, product_id, geography_json

consent_templates
  id, source_id, version, language, disclosure_text, proof_method,
  effective_at, retired_at

source_integrations
  id, source_id, type, credentials_secret_ref, config_json,
  status, last_tested_at, last_success_at

source_quality_daily
  id, source_id, metric_date, submitted, accepted, rejected,
  duplicate_rate, contactability_rate, conversion_rate, quality_score
```

### 7.3 Advertiser domain

```text
campaigns
  id, advertiser_org_id, name, vertical_id, product_id, status,
  timezone, starts_at, ends_at, daily_budget_cents, monthly_budget_cents,
  daily_cap, hourly_cap, bid_type, base_bid_cents, exclusivity,
  return_policy_id, current_version

campaign_versions
  id, campaign_id, version, targeting_json, eligibility_json,
  schedule_json, cap_config_json, evidence_requirements_json,
  created_by, created_at

campaign_endpoints
  id, campaign_id, type, endpoint_url, credentials_secret_ref,
  mapping_version, timeout_ms, retry_policy_json, status, last_tested_at

campaign_daily_usage
  campaign_id, usage_date, reserved_cents, charged_cents,
  accepted_count, reservation_count

return_policies
  id, name, window_hours, allowed_reason_codes, evidence_requirements_json
```

### 7.4 Opportunity and marketplace ledger

```text
opportunities
  id, public_transaction_id, publisher_org_id, source_id, vertical_id,
  product_id, external_submission_id, status, consumer_token,
  normalized_payload_encrypted, received_at, schema_version

consent_evidence
  id, opportunity_id, template_id, proof_provider, certificate_ref,
  proof_hash, captured_at, evidence_json

validation_runs
  id, opportunity_id, pipeline_version, status, composite_score,
  started_at, completed_at

validation_results
  id, validation_run_id, check_code, provider, outcome, score,
  reason_code, evidence_json, latency_ms

auction_runs
  id, opportunity_id, status, started_at, completed_at,
  winning_campaign_id, winning_bid_cents, decision_reason

auction_candidates
  id, auction_run_id, campaign_id, eligible, bid_cents, rank,
  reason_codes_json, rule_snapshot_json

deliveries
  id, opportunity_id, auction_run_id, campaign_id, endpoint_id,
  attempt_number, status, request_id, request_snapshot_redacted,
  response_snapshot_redacted, response_code, latency_ms,
  delivered_at, acknowledged_at

transactions
  id, opportunity_id, publisher_org_id, advertiser_org_id,
  campaign_id, delivery_id, status, advertiser_price_cents,
  publisher_amount_cents, platform_margin_cents, currency,
  accepted_at, billable_at, settled_at

transaction_events
  id, transaction_id, event_type, reason_code, actor_type,
  actor_id, payload_json, occurred_at, recorded_at
```

### 7.5 Outcomes and attribution

```text
conversion_events
  id, advertiser_org_id, transaction_id, external_event_id,
  external_record_id, event_type, revenue_cents, commission_cents,
  currency, product, occurred_at, received_at, source_method,
  validation_status, raw_payload_ref

conversion_event_errors
  id, advertiser_org_id, external_event_id, transaction_reference,
  error_code, error_detail, payload_ref, status, resolved_by, resolved_at

integration_connections
  id, organization_id, provider, type, credentials_secret_ref,
  config_json, status, last_success_at, last_failure_at, error_rate

integration_sync_runs
  id, connection_id, started_at, completed_at, status,
  records_read, records_written, error_summary
```

Unique constraint: `(advertiser_org_id, external_event_id)`. Events may arrive out of order; reporting must order by `occurred_at` while ingestion preserves `received_at`.

### 7.6 Finance

```text
financial_accounts
  id, organization_id, type, currency, status

ledger_entries
  id, journal_id, account_id, direction[debit|credit], amount_cents,
  currency, entry_type, reference_type, reference_id, occurred_at

journals
  id, type, status, idempotency_key, description, created_by, posted_at

payment_transactions
  id, advertiser_org_id, processor, processor_payment_id,
  amount_cents, currency, status, failure_code, completed_at

publisher_payables
  id, publisher_org_id, transaction_id, amount_cents,
  eligible_at, status, hold_reason

payout_methods
  id, publisher_org_id, provider, provider_account_ref,
  status, verified_at

payout_batches
  id, period_start, period_end, status, total_cents,
  approved_by, approved_at, released_at

payout_items
  id, batch_id, publisher_org_id, payable_id, amount_cents, status

credits_and_adjustments
  id, organization_id, transaction_id, type, amount_cents,
  reason_code, notes, approved_by, journal_id
```

All posted journals must balance: total debits equal total credits.

### 7.7 Operations

```text
notifications
  id, user_id, organization_id, type, channel, payload_json,
  status, sent_at, read_at

support_cases
  id, organization_id, transaction_id, type, priority, status,
  assigned_to, resolution_code

disputes
  id, transaction_id, opened_by_org_id, reason_code, evidence_json,
  status, decided_by, decided_at, adjustment_id

audit_events
  id, actor_user_id, actor_org_id, action, resource_type,
  resource_id, reason, before_redacted, after_redacted,
  ip_hash, request_id, created_at

webhook_endpoints
  id, organization_id, purpose, endpoint_url, signing_secret_ref,
  subscribed_events, status

webhook_deliveries
  id, webhook_endpoint_id, event_id, attempt, status,
  response_code, next_attempt_at, delivered_at
```

## 8. API contracts

### 8.1 General conventions

- Base path: `/api/v1`
- JSON request and response bodies
- OAuth/session auth for UI; scoped bearer keys for server integrations
- `Idempotency-Key` required for opportunity submission, conversion events, funding intents, credits and payouts
- `X-Request-Id` returned on every request
- Cursor pagination
- UTC ISO 8601 timestamps
- Money represented as integer minor units plus ISO currency
- Stable machine-readable error codes
- API versions remain backward compatible within `/v1`

Standard error:

```json
{
  "error": {
    "code": "CAMPAIGN_NOT_FUNDED",
    "message": "Campaign requires available funds before activation.",
    "request_id": "req_01J...",
    "details": {}
  }
}
```

### 8.2 Opportunity submission

`POST /api/v1/opportunities`

Headers: `Authorization`, `Idempotency-Key`, optional `X-Schema-Version`.

```json
{
  "external_submission_id": "pub-884203",
  "source_id": "src_uuid",
  "vertical": "home_services",
  "product": "solar",
  "consumer": {
    "first_name": "Jane",
    "last_name": "Doe",
    "phone": "+13105550100",
    "email": "jane@example.com",
    "postal_code": "91406"
  },
  "attributes": {
    "homeowner": true,
    "electric_bill_range": "200_299"
  },
  "consent": {
    "template_version": "solar-v3",
    "captured_at": "2026-08-15T04:00:00Z",
    "certificate_url": "https://provider.example/cert/...",
    "ip": "203.0.113.1",
    "user_agent": "..."
  }
}
```

Accepted response:

```json
{
  "transaction_id": "QL-90184",
  "status": "accepted",
  "decision": {"buyer_status":"delivered","value_minor":6825,"currency":"USD"},
  "quality": {"score":92,"reason_codes":[]}
}
```

Rejected response is still HTTP 200 for a processed marketplace decision and includes `status: rejected` plus reason codes. Schema/auth/rate errors use 4xx.

### 8.3 Ping/post

- `POST /api/v1/opportunities/ping` returns eligibility and a short-lived `ping_token`.
- `POST /api/v1/opportunities/post` submits full data with the token.
- Tokens are single-use, expire quickly and bind source, product and normalized consumer fingerprint.

### 8.4 Campaigns

- `GET /api/v1/campaigns`
- `POST /api/v1/campaigns`
- `GET /api/v1/campaigns/{id}`
- `PATCH /api/v1/campaigns/{id}`
- `POST /api/v1/campaigns/{id}/test`
- `POST /api/v1/campaigns/{id}/submit-review`
- `POST /api/v1/campaigns/{id}/activate`
- `POST /api/v1/campaigns/{id}/pause`
- `GET /api/v1/campaigns/{id}/performance`

Activation verifies approval, endpoint health, available balance and valid targeting.

### 8.5 Publisher sources

- `GET /api/v1/sources`
- `POST /api/v1/sources`
- `PATCH /api/v1/sources/{id}`
- `POST /api/v1/sources/{id}/submit-review`
- `POST /api/v1/sources/{id}/test`
- `POST /api/v1/sources/{id}/pause`
- `GET /api/v1/sources/{id}/quality`
- `GET /api/v1/sources/{id}/earnings`

### 8.6 Conversion events

`POST /api/v1/conversions/events`

```json
{
  "event_id": "crm-event-44718",
  "transaction_id": "QL-90184",
  "event": "sale",
  "revenue_minor": 125000,
  "commission_minor": 0,
  "currency": "USD",
  "occurred_at": "2026-08-15T04:42:17Z",
  "external_record_id": "CRM-88421",
  "product": "term-life"
}
```

Response:

```json
{
  "event_id": "crm-event-44718",
  "status": "accepted",
  "transaction_id": "QL-90184",
  "attributed": true
}
```

Rules:

- Verify bearer scope or HMAC signature.
- Deduplicate by advertiser organization plus `event_id`.
- Verify transaction belongs to that advertiser.
- Accept out-of-order events.
- Reject impossible currency/amount values.
- Send unresolved transaction references to the attribution-error queue.
- A retry with identical data returns the original result.
- A reused event ID with different data returns `409 IDEMPOTENCY_CONFLICT`.

Batch fallback: `POST /api/v1/conversions/imports` creates an asynchronous import with a downloadable error report.

### 8.7 Reporting

- `GET /api/v1/reporting/advertiser/overview`
- `GET /api/v1/reporting/advertiser/funnel`
- `GET /api/v1/reporting/advertiser/revenue`
- `GET /api/v1/reporting/publisher/overview`
- `GET /api/v1/reporting/publisher/quality`
- `GET /api/v1/reporting/publisher/earnings`
- `GET /api/v1/transactions`
- `GET /api/v1/transactions/{transaction_id}`
- `POST /api/v1/reports/exports`

Filters include organization-authorized campaign/source, vertical, product, status, event type and date range. Reports use the organization timezone for grouping and UTC for stored timestamps.

### 8.8 Funding and payouts

- `POST /api/v1/billing/funding-intents`
- `GET /api/v1/billing/balance`
- `GET /api/v1/billing/ledger`
- `GET /api/v1/billing/invoices`
- `GET /api/v1/publisher/payables`
- `GET /api/v1/publisher/payouts`
- `POST /api/v1/admin/payout-batches`
- `POST /api/v1/admin/payout-batches/{id}/approve`
- `POST /api/v1/admin/payout-batches/{id}/release`

### 8.9 Platform webhooks

Outbound webhooks include:

- `opportunity.accepted`
- `opportunity.rejected`
- `delivery.failed`
- `campaign.low_balance`
- `campaign.cap_reached`
- `source.quality_warning`
- `transaction.returned`
- `payout.approved`
- `payout.paid`

Signature format:

```text
X-Qentrax-Event-Id: evt_...
X-Qentrax-Timestamp: 1786760000
X-Qentrax-Signature: v1=<hex_hmac_sha256(timestamp + "." + raw_body)>
```

Reject replay outside a five-minute tolerance. Retry with exponential backoff and dead-letter after the configured limit.

## 9. State machines

### 9.1 Organization onboarding

```text
draft → email_verified → profile_submitted → under_review
under_review → approved | needs_information | rejected
needs_information → profile_submitted
approved → suspended → approved | closed
```

### 9.2 Campaign

```text
draft → testing → pending_review → approved → active
active ↔ paused
active | paused → exhausted
exhausted → active (after funding/reset)
draft | testing | paused → archived
approved → rejected (only before activation, with reason)
```

An active campaign automatically enters paused/exhausted behavior when unfunded, outside schedule or capped, without losing its approved configuration.

### 9.3 Publisher source

```text
draft → pending_review → needs_information | approved | rejected
approved → testing → active
active ↔ paused
active → quality_hold | suspended
quality_hold → active | suspended
paused | suspended → archived
```

### 9.4 Opportunity

```text
received → validating → rejected_quality | ready
ready → matching → no_match | auctioning
auctioning → reserved → delivering
delivering → delivered | delivery_failed
delivery_failed → auctioning | failed
delivered → accepted | buyer_rejected
accepted → billable → settled
billable | settled → returned | disputed
disputed → upheld | reversed
```

Every transition appends a transaction event and validates the current state atomically.

### 9.5 Conversion event

```text
received → validating → attributed | rejected | unresolved
unresolved → attributed | rejected
attributed → superseded (only through a linked correction event)
```

Never delete outcome history. Cancellation and refund are new events.

### 9.6 Advertiser funds

```text
payment_intent_created → pending → succeeded | failed | cancelled
succeeded → available
available → reserved → charged | released
charged → credited | disputed
```

### 9.7 Publisher payable and payout

```text
pending → eligible → batched → approved → processing → paid
pending | eligible → held
held → eligible | voided
processing → failed → processing | held
```

## 10. Dashboard requirements

### 10.1 Advertiser dashboard

- Available balance, spend, accepted leads and average CPL
- Sales, revenue, CPA and ROAS
- Conversion funnel and trend chart
- Campaign health, caps and pacing
- Live opportunity and conversion stream
- Campaign builder and versioned rules
- Endpoint/CRM setup with test console
- Webhook credentials, signature example and last-event health
- Funding, invoices, credits and transaction ledger
- Returns and disputes
- Scheduled reports and exports

### 10.2 Publisher dashboard

- Estimated earnings, pending payout, acceptance rate and average revenue per lead
- Source health and trend chart
- Live opportunity ledger
- Source creation, review and testing
- Integration credentials and test console
- Rejection-reason analysis
- Quality alerts and recommended corrections
- Payables, statements, payout history and tax/bank status
- Reports and exports

### 10.3 Admin dashboard

- Marketplace GMV, margin, volume, acceptance and delivery health
- Advertiser, publisher, campaign and source approval queues
- Q-Shield flags and evidence inspection
- Transaction trace viewer
- Rule and vertical configuration
- Returns and dispute adjudication
- Advertiser credits and payment reconciliation
- Publisher payable holds and payout approvals
- User/account suspension
- Integration failure monitoring
- Immutable audit log and export

## 11. Nonfunctional architecture

### 11.1 Recommended stack

- Next.js and TypeScript for web application and server endpoints
- PostgreSQL/Supabase for relational data, authentication and row-level security
- Stripe for advertiser funding and payment events
- Queue-backed workers for validation, delivery, callbacks, imports and webhooks
- Redis-compatible store for short reservations, rate limiting and idempotency acceleration
- Object storage for consent certificates, import files, statements and evidence
- OpenTelemetry plus Sentry for tracing and errors
- Secrets manager for API keys, signing secrets and provider credentials

Separate the latency-sensitive marketplace execution path from dashboard/reporting workloads. Do not put long provider calls in a single unbounded web request.

### 11.2 Reliability targets

- API availability target: 99.9%
- Marketplace decision p95 target: under 500 ms excluding publisher-controlled post latency
- Internal auction p95 target: under 150 ms after validations are available
- Dashboard outcome visibility: under 10 seconds after valid webhook receipt
- No duplicate charge or payout under retries
- Recovery point target: 15 minutes or better
- Recovery time target: 2 hours or better for MVP

### 11.3 Security and compliance

- Encrypt sensitive consumer payloads at rest and in transit.
- Tokenize consumers for analytics; avoid raw PII in logs.
- Apply least-privilege RBAC and row-level data isolation.
- Rotate API keys and webhook secrets.
- HMAC-sign outbound webhooks and verify inbound provider signatures.
- Rate-limit by key, organization, source and IP risk.
- Record consent provenance and retention policy.
- Support data subject lookup, export and deletion/anonymization workflows subject to legal retention.
- Maintain immutable financial and administrative audit trails.
- Use dependency, SAST and secret scanning in CI.
- Require MFA/step-up authentication for administrative finance actions.
- Define incident response, breach notification and credential revocation procedures.

Qentrax must provide evidence tooling and configuration; it must not claim that technology alone guarantees TCPA or industry compliance. Agreements and program rules require counsel review.

## 12. Notifications

In-app and email notifications for:

- Account or source approval status
- Campaign approval/activation
- Low balance and payment failure
- Cap reached
- Endpoint or integration failure
- Source quality warning or hold
- Return/dispute opened and decided
- Conversion integration errors
- Payout threshold reached
- Payout approved, failed or paid
- Administrative requests for information

Notifications are deduplicated and preference-aware. Critical operational notices cannot be disabled in-app.

## 13. Acceptance tests

The following are release-blocking end-to-end tests.

### 13.1 Identity and access

1. An advertiser user cannot access any publisher or other advertiser organization data.
2. A publisher analyst cannot change payout information.
3. A finance admin action fails without required permission and step-up authentication.
4. Every admin override records actor, reason, resource and before/after state.

### 13.2 Advertiser onboarding and campaigns

1. An approved advertiser can create and test a campaign before funding.
2. An unfunded campaign cannot activate and returns `CAMPAIGN_NOT_FUNDED`.
3. Funding of at least the configurable opening amount permits activation after successful Stripe confirmation.
4. Caps, schedules, targeting and endpoint health remove an ineligible campaign from auction with recorded reason codes.
5. Editing an active campaign creates a new version without altering historical decision snapshots.

### 13.3 Publisher onboarding and sources

1. A publisher can register without payment.
2. An unapproved source cannot submit live opportunities.
3. Test submissions never generate live advertiser charges or publisher payables.
4. Source quality hold blocks live traffic and sends a notification.
5. Publisher dashboard metrics are isolated by authorized source and organization.

### 13.4 Marketplace and Q-Shield

1. A valid opportunity passes the configured pipeline, is auctioned and produces a traceable decision.
2. A duplicate submission with the same idempotency key returns the original result and creates no second charge.
3. A duplicated consumer inside the configured window is rejected with the canonical duplicate reason.
4. Provider downtime produces `review/unavailable`, not a false identity failure.
5. Concurrent auctions cannot overspend a campaign or exceed its hard cap.
6. Delivery failure releases its reservation and attempts the next eligible buyer according to policy.
7. Accepted delivery produces balanced advertiser charge, publisher payable and platform-margin entries.

### 13.5 Real-time sales tracking

1. A valid `sale` event with a known transaction appears in advertiser reporting within 10 seconds.
2. The same event ID and payload can be retried without a duplicate sale.
3. The same event ID with changed data returns an idempotency conflict.
4. An event for a transaction owned by another advertiser is rejected without revealing transaction details.
5. An unknown transaction goes to the unresolved queue and can later be attributed.
6. Events arriving out of order produce a correct occurred-time funnel while preserving receipt order.
7. A refund event reduces net revenue and ROAS without deleting the original sale.
8. Dashboard integration health shows last success, last failure and recent error rate.
9. CSV import uses the same validation and idempotency rules as the API.

### 13.6 Finance

1. Stripe webhook replay does not credit an advertiser twice.
2. All posted journals balance.
3. Returned transactions create linked adjustments and correct both advertiser and publisher positions.
4. Publisher payables do not become payout-eligible before Net 30.
5. A publisher below $100 is carried forward.
6. A payout cannot be released without tax/bank readiness and finance approval.
7. A failed payout remains recoverable and never duplicates paid items.

### 13.7 Security and operations

1. Raw consumer PII and secrets never appear in application logs.
2. Invalid webhook signatures and stale timestamps are rejected.
3. Revoked API keys immediately lose access.
4. Rate limits isolate abusive sources without globally blocking healthy traffic.
5. Transaction traces correlate intake, validation, auction, delivery, outcomes and finance using one request/transaction identity.

## 14. Phased implementation milestones

Each phase must end with migrations, seed data, automated tests, working UI, API documentation, security review notes and a deployable preview. Codex must not mark a phase complete if its acceptance tests fail.

### Phase 0 — Foundation and contracts

- Repository and environment structure
- CI, linting, formatting, test framework and preview deployment
- Authentication foundation and organization context
- Core enums, reason-code registry and API conventions
- Database migration strategy and seed framework
- Observability, request IDs and audit utility
- Architecture decision records

**Exit:** users can authenticate into an organization-scoped shell; CI and migrations are reliable.

### Phase 1 — Accounts, RBAC and onboarding

- Organization/member model
- Advertiser and publisher registration
- KYB/KYC status workflow
- Agreements and acceptances
- Admin approval queues
- Tax and payout readiness placeholders
- Role and permission enforcement tests

**Exit:** approved and rejected account flows work; cross-tenant access tests pass.

### Phase 2 — Advertiser campaigns and funding

- Campaign builder, versions and statuses
- Targeting, budgets, bids, caps and schedules
- Endpoint configuration and test console
- Stripe funding intents and verified webhook processing
- Double-entry advertiser funding ledger
- Advertiser dashboard core metrics

**Exit:** an advertiser can configure/test, fund at launch and activate a campaign.

### Phase 3 — Publisher sources and intake

- Source registration, review and status workflow
- Consent templates and evidence capture
- Source integration credentials
- REST and ping/post opportunity submission
- Controlled test mode
- Publisher dashboard source and quality views

**Exit:** an approved publisher source can submit a test opportunity through the documented API.

### Phase 4 — Q-Shield, auction, routing and transaction ledger

- Validation orchestration and pluggable providers
- Duplicate, velocity, consent and eligibility rules
- Campaign matching and atomic budget reservation
- Auction decision ledger
- Delivery engine, retries and fallback buyers
- Billable transaction creation
- Publisher payable and platform-margin entries
- Full transaction trace in admin

**Exit:** live opportunity completes intake-to-billing with balanced ledger entries and reason-coded evidence.

### Phase 5 — Closed-loop conversions and real-time sales reporting

- Conversion-event API and HMAC option
- Idempotency, attribution and unresolved queue
- Advertiser webhook setup/test console
- Funnel, sales, revenue, CPA and ROAS reporting
- Integration health
- CSV/SFTP outcome import
- Initial Salesforce and HubSpot adapters if credentials are available

**Exit:** a delivered opportunity can receive a sale/refund outcome and update dashboard metrics within 10 seconds.

### Phase 6 — Returns, disputes and publisher payouts

- Return-policy enforcement
- Dispute evidence and adjudication
- Credits and financial adjustments
- Net 30 payable eligibility
- $100 configurable threshold
- Payout batches, finance approval and release
- Statements and reconciliation reports

**Exit:** a monthly settlement cycle can be simulated from advertiser charge through publisher payout and adjustment.

### Phase 7 — Admin operations, hardening and launch

- Vertical/rule management
- Account and source suspension
- Quality queues and notifications
- Operational dashboards and alerts
- Data retention/export/deletion workflows
- Load, concurrency, failure and security testing
- Runbooks, backup restore and incident response
- Production readiness review

**Exit:** all release-blocking acceptance tests pass; operations can monitor, reconcile and recover the platform.

## 15. Codex execution rules

Codex must:

1. Treat this document as canonical and record any proposed deviation in an ADR before implementation.
2. Preserve the approved Qentrax visual language and responsive behavior from the design reference.
3. Build vertical slices with working UI, API, database and tests—not disconnected mock screens.
4. Use migrations for every schema change and never edit production data manually.
5. Use generated typed clients/schemas where practical to prevent API drift.
6. Keep secrets out of source control and logs.
7. Implement idempotency and auditability before enabling money movement.
8. Never substitute mutable balance columns for ledger accounting.
9. Maintain fixture organizations for advertiser, publisher and admin acceptance testing.
10. Update API documentation and this specification’s implementation-status appendix at every phase.
11. Stop and surface a blocker when a required external credential, legal decision or payment-account action needs the owner.

## 16. Required environment integrations

The implementation should define placeholders and validation for:

- Supabase/Postgres URL and service credentials
- Stripe publishable key, secret key and webhook secret
- Email provider credentials
- Object-storage configuration
- Queue/Redis configuration
- Validation providers for phone/email/identity
- TrustedForm and/or Jornaya credentials where used
- Sentry and telemetry endpoints
- CRM OAuth credentials per connector

Do not require every optional integration to run locally. Provide adapters, mocks and health checks.

## 17. Definition of done

Qentrax MVP is complete when:

- Advertisers and publishers can register and pass admin approval.
- Advertisers can build/test campaigns and fund them when launching.
- Publishers can register/test approved sources without paying an opening balance.
- Q-Shield records evidence and reason-coded decisions.
- Eligible campaigns compete and receive opportunities without overspend.
- Every accepted transaction creates balanced financial entries.
- Advertisers can report sales in near real time through a retry-safe webhook/API.
- Sales, revenue, CPA, ROAS and conversion funnels update correctly.
- Publishers can see quality, earnings and Net 30 payout status.
- Administrators can inspect the complete transaction trail, resolve disputes and approve payouts.
- Tenant isolation, audit, webhook security, financial idempotency and recovery tests pass.
- Operational documentation and launch runbooks are complete.

---

## Appendix A — Canonical reason-code families

- `SCHEMA_*` — missing, invalid or unsupported fields
- `IDENTITY_*` — identity/contact checks
- `CONSENT_*` — missing, invalid, expired or unverifiable proof
- `DUPLICATE_*` — source, network or campaign duplicate
- `VELOCITY_*` — rate or anomaly threshold
- `GEO_*` — geography mismatch
- `ELIGIBILITY_*` — vertical/product or buyer-rule mismatch
- `CAMPAIGN_*` — status, schedule, cap, funding or endpoint
- `DELIVERY_*` — timeout, transport, mapping or buyer rejection
- `RETURN_*` — return policy and evidence
- `PAYMENT_*` — funding and processor state
- `PAYOUT_*` — threshold, hold, tax/bank or processor state
- `CONVERSION_*` — attribution, event validation or conflict
- `AUTH_*` — authentication, authorization and key state

Reason codes are stable API contracts. Human descriptions may change; codes may not be repurposed.

## Appendix B — Key product metrics

| Metric | Definition |
|---|---|
| Submitted | Unique live opportunities received after idempotency |
| Quality accepted | Opportunities that passed required Q-Shield checks |
| Buyer accepted | Delivered opportunities accepted under buyer contract |
| Billable lead | Buyer-accepted transaction with posted charge journal |
| Acceptance rate | Buyer accepted ÷ submitted, using consistent cohort rules |
| Contact rate | Unique transactions with `contacted` ÷ delivered transactions |
| Qualification rate | Unique transactions with `qualified` ÷ delivered transactions |
| Sale rate | Unique transactions with `sale` ÷ delivered transactions |
| CPL | Advertiser charged amount ÷ billable leads |
| CPA | Advertiser charged amount ÷ unique sales |
| Gross revenue | Sum of valid sale/revenue events before refunds |
| Net revenue | Gross revenue minus cancellation/refund adjustments |
| ROAS | Net attributed revenue ÷ advertiser charged amount |
| Publisher RPL | Publisher earned amount ÷ publisher billable opportunities |
| Platform margin | Advertiser charge minus publisher payable and direct transaction costs |

All dashboard metrics must state cohort/date semantics and timezone.
