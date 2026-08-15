# Owner actions

Do not paste credentials into chat or commit them. Configure deployment secrets in Vercel and local values in `.env.local`.

| Action | Configuration | Blocks | Verification |
|---|---|---|---|
| Provide the existing repository/design source if one exists | Add or merge it into this workspace | Preservation audit and exact approved-design parity | Git history and source routes are visible |
| Configure Qentrax Supabase keys in Vercel | `NEXT_PUBLIC_SUPABASE_URL`, a Supabase publishable key, and server-only credentials where required | Phase 0 authenticated exit test | Email sign-in reaches an organization-scoped shell; no secret key reaches the browser |
| Link Vercel project and preview environment | Vercel project settings; no URL hardcoded | Preview deployment | CI preview returns `/api/v1/health` with `X-Request-Id` |
| Approve agreements and compliance language with counsel | Legal documents/account policy | Phase 1 agreement acceptance and production onboarding | Approved versions recorded in agreement fixtures |
| Provision Stripe account/webhook | Stripe dashboard secrets in deployment environment | Phase 2 live funding | Signed test event posts one balanced funding journal |
| Provision Redis, object storage, email and telemetry | Variables documented in `.env.example` | Later live integrations/monitoring | Adapter health checks report available |
