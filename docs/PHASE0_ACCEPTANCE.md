# Phase 0 acceptance checklist

Exit criterion (canonical §14): **users can authenticate into an organization-scoped shell; CI and migrations are reliable.**

## Automated (CI)

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test` (foundation contracts: request IDs, tenant isolation, reason codes, audit)
- [x] `npm run build`
- [x] Secret scan in CI

## Database

- [x] Phase 0 foundation migration (users, organizations, roles, members, reason_codes, audit_events)
- [x] RLS enabled on all foundation tables
- [x] Append-only audit trigger
- [x] FK indexes
- [x] User bootstrap trigger (`auth.users` → `public.users`)
- [x] Canonical role seed (§4.1)
- [x] Stable reason-code seed (Appendix A families)

## Application contracts

- [x] `/api/v1/health` returns JSON + `X-Request-Id`
- [x] API error envelope `{ error: { code, message, request_id, details } }`
- [x] Organization access helper rejects cross-tenant by default
- [x] Audit utility requires `requestId` + `action`
- [x] Magic-link sign-in + `/auth/confirm` → `/workspace`
- [x] Workspace loads memberships under RLS; empty state when no org yet

## Owner verification (required to mark Phase 0 complete)

See `docs/OWNER_ACTIONS.md`.

1. Apply migration `20260815063000_phase0_user_bootstrap.sql` on the live Supabase project.
2. Re-run / confirm seed for expanded roles and reason codes.
3. Configure Supabase Auth site URL + redirect allow-list to include production and preview URLs ending in `/auth/confirm`.
4. Configure magic-link email template to use token-hash confirmation path if not already.
5. Send a live magic link → land on `/workspace` with identity verified.
6. Confirm `/api/v1/health` on the Vercel deployment returns `status: ok` and an `X-Request-Id` header.

When steps 1–6 pass, update `docs/IMPLEMENTATION_STATUS.md` to mark Phase 0 **Complete** and uncheck the Phase 0 line in `docs/TASKS.md`.
