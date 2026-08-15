# Qentrax architecture

Qentrax begins as a modular Next.js application with versioned `/api/v1` route handlers and a PostgreSQL/Supabase system of record. The browser authenticates through Supabase; server paths derive an active organization context and PostgreSQL RLS provides defense in depth. Platform-admin cross-tenant access requires an explicit permission and audit event.

The permanent Qentrax transaction ID will correlate intake, validation, auction, delivery, conversion, finance and payout records. Request IDs correlate individual HTTP/worker attempts. Immutable audit and, before Phase 2 money movement, double-entry journal constraints are mandatory.

External systems are behind adapters. Missing credentials produce unavailable health states, never production claims. Validation, routing, callbacks and imports move to independently deployable queue workers before their phases become live.

See [ADR-0001](adr/0001-modular-nextjs-supabase-foundation.md).
