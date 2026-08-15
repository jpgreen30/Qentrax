# Demo path (1 → 2 → 3)

End-to-end **test-mode** walkthrough without Stripe keys.

## Prerequisites
- Signed in at https://qentrax.vercel.app/sign-in
- `jpgreen1@gmail.com` is platform admin (seeded)

## Steps

1. **Create advertiser org** — `/onboarding` → type Advertiser
2. **Create publisher org** — `/onboarding` → type Publisher (same user is fine for demo)
3. **Approve both** — `/workspace/admin` → Approve
4. **Fund advertiser** — Advertiser workspace → **Post $500 test funding**  
   Posts balanced journal: debit `platform_cash`, credit `advertiser_balance`
5. **Create + activate campaign** — draft campaign → **Activate**  
   Requires org `approved` + balance ≥ max(bid, $500)
6. **Publisher source + test lead** — create source → **Submit test lead**  
   Runs `run_minimal_auction`: highest active bid wins → delivery accepted → billable transaction + ledger charge/payable

## Expected results
- Auction status `billable` with `QL-xxxxx`
- Publisher workspace shows transaction row
- Advertiser balance decreases by bid amount

## Production gaps
- Replace `record_test_funding` with Stripe PaymentIntent + webhook → same journal function
- Real Q-Shield providers, endpoint HTTP delivery, Net 30 payout batching
