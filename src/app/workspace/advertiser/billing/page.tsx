import WorkspaceShell from "@/components/WorkspaceShell";
import { isStripeConfigured } from "@/lib/stripe/client";
import { initials, money, requireOrg } from "@/lib/workspace-data";
import { postTestFunding, startStripeFunding } from "../actions";

export default async function AdvertiserBilling({
  searchParams,
}: {
  searchParams: Promise<{
    org?: string;
    funded?: string;
    cancelled?: string;
    error?: string;
    session_id?: string;
  }>;
}) {
  const params = await searchParams;
  const { supabase, org } = await requireOrg(params.org, "advertiser");
  const stripeReady = isStripeConfigured();

  const { data: orgFull } = await supabase
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", org.id)
    .maybeSingle();

  const { data: balance } = await supabase.rpc("advertiser_available_balance_cents", {
    p_organization_id: org.id,
  });
  const bal = Number(balance ?? 0);

  const { data: accounts } = await supabase
    .from("financial_accounts")
    .select("id, type")
    .eq("organization_id", org.id);

  const acctIds = (accounts ?? []).map((a) => a.id);
  const { data: entries } =
    acctIds.length > 0
      ? await supabase
          .from("ledger_entries")
          .select("id, journal_id, account_id, direction, amount_cents, occurred_at")
          .in("account_id", acctIds)
          .order("occurred_at", { ascending: false })
          .limit(40)
      : { data: [] as { id: string; direction: string; amount_cents: number; occurred_at: string }[] };

  const notice =
    params.error
      ? params.error
      : params.funded
        ? "Funding received — balance will update after Stripe webhook settles."
        : params.cancelled
          ? "Checkout cancelled — no charge."
          : null;

  return (
    <WorkspaceShell
      role="advertiser"
      orgId={org.id}
      orgName={org.legal_name}
      orgStatus={org.onboarding_status}
      initials={initials(org.legal_name)}
      active="billing"
      eyebrow="DEMAND COMMAND"
      title="Billing & funding"
      subtitle="Media balance via Stripe Checkout. Webhook posts a balanced ledger journal."
    >
      {notice && (
        <p
          className="dashNotice"
          style={params.error ? { borderColor: "#5a2a2a", color: "#ff8a8a" } : undefined}
        >
          {notice}
        </p>
      )}

      <div className="dashStats">
        <article>
          <header>
            <span>AVAILABLE BALANCE</span>
            <i>◫</i>
          </header>
          <strong>{money(bal)}</strong>
          <small>{bal > 0 ? "FUNDED" : "UNFUNDED"}</small>
        </article>
        <article>
          <header>
            <span>STRIPE CUSTOMER</span>
            <i>$</i>
          </header>
          <strong>{orgFull?.stripe_customer_id ? "LINKED" : "—"}</strong>
          <small>{orgFull?.stripe_customer_id?.slice(0, 14) ?? "NOT YET"}</small>
        </article>
        <article>
          <header>
            <span>ENTRIES</span>
            <i>↗</i>
          </header>
          <strong>{(entries ?? []).length}</strong>
          <small>RECENT</small>
        </article>
        <article>
          <header>
            <span>MODE</span>
            <i>▦</i>
          </header>
          <strong>{stripeReady ? "LIVE" : "TEST"}</strong>
          <small>{stripeReady ? "STRIPE READY" : "KEYS MISSING"}</small>
        </article>
      </div>

      <div className="dashLower">
        <article className="dashPanel">
          <header>
            <span>LEDGER ACTIVITY</span>
            <h2>Recent balance movements</h2>
          </header>
          <div className="tableHead bill">
            <span>DIRECTION</span>
            <span>AMOUNT</span>
            <span>WHEN</span>
          </div>
          {(entries ?? []).map((e) => (
            <div className="tableRow bill" key={e.id}>
              <span className="status">{e.direction?.toUpperCase()}</span>
              <span>{money(e.amount_cents)}</span>
              <span>{new Date(e.occurred_at).toLocaleString()}</span>
            </div>
          ))}
          {!entries?.length && (
            <div className="tableRow">
              <span className="status">No ledger entries yet.</span>
            </div>
          )}
        </article>

        <article className="quick">
          <header>
            <span>FUND ACCOUNT</span>
          </header>

          {stripeReady ? (
            <>
              <form action={startStripeFunding} className="workspace-actions">
                <input type="hidden" name="organization_id" value={org.id} />
                <input type="hidden" name="amount_cents" value={50000} />
                <button className="quickRow" type="submit">
                  <i>$</i>
                  <span>
                    <b>Fund $500 via Stripe</b>
                    <small>Checkout · min opening balance</small>
                  </span>
                  <em>→</em>
                </button>
              </form>
              <form action={startStripeFunding} className="workspace-actions">
                <input type="hidden" name="organization_id" value={org.id} />
                <input type="hidden" name="amount_cents" value={200000} />
                <button className="quickRow" type="submit">
                  <i>$</i>
                  <span>
                    <b>Fund $2,000 via Stripe</b>
                    <small>Larger media balance</small>
                  </span>
                  <em>→</em>
                </button>
              </form>
            </>
          ) : (
            <p style={{ padding: "12px 16px", color: "#718287", fontSize: 13 }}>
              Set <code>STRIPE_SECRET_KEY</code> + <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> to
              enable live Checkout.
            </p>
          )}

          <form action={postTestFunding} className="workspace-actions">
            <input type="hidden" name="organization_id" value={org.id} />
            <input type="hidden" name="amount_cents" value={50000} />
            <button className="quickRow" type="submit">
              <i>◎</i>
              <span>
                <b>Post $500 test funding</b>
                <small>Ledger only · no card charge</small>
              </span>
              <em>→</em>
            </button>
          </form>
        </article>
      </div>
    </WorkspaceShell>
  );
}
