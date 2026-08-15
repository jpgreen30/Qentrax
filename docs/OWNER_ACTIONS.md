# Owner actions

Do not paste credentials into chat or commit them. Configure deployment secrets in Vercel and local values in `.env.local`.

| Action | Configuration | Blocks | Verification |
|---|---|---|---|
| Provide the existing repository/design source if one exists | Add or merge it into this workspace | Preservation audit and exact approved-design parity | Git history and source routes are visible |
| Configure Supabase production email redirects/templates | Add the production site URL and token-hash confirmation template in Supabase Auth | Phase 0 live email authentication | Magic link returns to `/auth/confirm` and reaches the protected workspace |
| Link Vercel project and preview environment | Vercel project settings; no URL hardcoded | Preview deployment | CI preview returns `/api/v1/health` with `X-Request-Id` |
| Approve agreements and compliance language with counsel | Legal documents/account policy | Phase 1 agreement acceptance and production onboarding | Approved versions recorded in agreement fixtures |
| Provision Stripe account/webhook | Stripe dashboard secrets in deployment environment | Phase 2 live funding | Signed test event posts one balanced funding journal |
| Provision Redis, object storage, email and telemetry | Variables documented in `.env.example` | Later live integrations/monitoring | Adapter health checks report available |
