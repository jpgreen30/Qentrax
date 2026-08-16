# Launch checklist

Last updated: 2026-08-15

## Engineering (Phase 7)

- [x] Delivery HTTP attempt + simulate-on-missing
- [x] Delivery retry worker (`/api/cron/deliveries`, every 2 min)
- [x] Backoff + max attempts + SLA due timestamp
- [x] Stripe Checkout funding webhook (test mode proven)
- [x] Connect transfer-on-release (test path)
- [ ] Load test auction + delivery under concurrent intake
- [ ] Sentry/OTEL wired to production errors (env stubs only)
- [ ] Full RLS audit of new Stripe/delivery columns

## Security

- [x] Stripe webhook signature verification
- [x] Cron routes gated by `CRON_SECRET`
- [x] Service-role key only on server (admin client)
- [ ] Rotate test secrets before live cutover
- [ ] Confirm no service-role in client bundles

## Owner / ops (production money)

- [ ] Stripe **live** keys + Connect platform profile complete
- [ ] Live webhook endpoints (Your account + Connected) with live `whsec_`
- [ ] `NEXT_PUBLIC_SITE_URL` production URL
- [ ] PX API token when client onboarded
- [ ] Counsel-approved agreements + KYB provider
- [ ] Tax form collection (1099) before first real payout
- [ ] Magic-link email templates (token_hash) verified on production domain

## Smoke tests before live traffic

1. Advertiser Fund $500 test → webhook 200 → ledger credit
2. Publisher Connect onboard → `payouts_enabled`
3. Test opportunity → auction billable → delivery accepted or retry scheduled
4. Admin Finance batch → release → Stripe transfer (test)
5. `GET /api/v1/health` ok
6. Cron: `Authorization: Bearer $CRON_SECRET` on `/api/cron/deliveries` and `/api/cron/payouts`
