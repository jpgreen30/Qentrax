import WorkspaceShell from "@/components/WorkspaceShell";
import { isStripeConfigured } from "@/lib/stripe/client";
import { initials, money, requireOrg } from "@/lib/workspace-data";
import { startConnectOnboarding } from "../actions";

export default async function PublisherEarnings({
  searchParams,
}: {
  searchParams: Promise<{
    org?: string;
    connect?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const { supabase, org } = await requireOrg(params.org, "publisher");
  const stripeReady = isStripeConfigured();

  const { data: orgFull } = await supabase
    .from("organizations")
    .select(
      "stripe_connect_account_id, stripe_connect_status, stripe_payouts_enabled, stripe_charges_enabled",
    )
    .eq("id", org.id)
    .maybeSingle();

  const { data: txns } = await supabase
    .from("transactions")
    .select("id, status, publisher_amount_cents, created_at")
    .eq("publisher_org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: accounts } = await supabase
    .from("financial_accounts")
    .select("id, type")
    .eq("organization_id", org.id)
    .eq("type", "publisher_payable");

  const payableId = accounts?.[0]?.id;
  const { data: entries } = payableId
    ? await supabase
        .from("ledger_entries")
        .select("id, direction, amount_cents, occurred_at")
        .eq("account_id", payableId)
        .order("occurred_at", { ascending: false })
        .limit(40)
    : { data: [] as { id: string; direction: string; amount_cents: number; occurred_at: string }[] };

  const pending = (txns ?? [])
    .filter((t) => t.status === "billable")
    .reduce((s, t) => s + (t.publisher_amount_cents ?? 0), 0);

  const billableCount = (txns ?? []).filter((t) => t.status === "billable").length;
  const connectStatus = (orgFull?.stripe_connect_status ?? "not_started").toUpperCase();
  const payoutsOk = !!orgFull?.stripe_payouts_enabled;

  const notice =
    params.error
      ? params.error
      : params.connect === "return"
        ? "Returned from Stripe — status will update via webhook."
        : params.connect === "refresh"
          ? "Onboarding link expired — start again below."
          : null;

  return (
    <WorkspaceShell
      role="publisher"
      orgId={org.id}
      orgName={org.legal_name}
      orgStatus={org.onboarding_status}
      initials={initials(org.legal_name)}
      active="earnings"
      eyebrow="SUPPLY COMMAND"
      title="Earnings & payouts"
      subtitle="Payable balance from billable leads. Connect Stripe Express to receive transfers."
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
            <span>PENDING PAYABLE</span>
            <i>$</i>
          </header>
          <strong>{money(pending)}</strong>
          <small>NET-N BATCHED</small>
        </article>
        <article>
          <header>
            <span>BILLABLE TXNS</span>
            <i>◎</i>
          </header>
          <strong>{billableCount}</strong>
          <small>ALL VIEW</small>
        </article>
        <article>
          <header>
            <span>CONNECT</span>
            <i>⌁</i>
          </header>
          <strong>{connectStatus}</strong>
          <small>{payoutsOk ? "PAYOUTS ON" : "PAYOUTS OFF"}</small>
        </article>
        <article>
          <header>
            <span>AVG RPL</span>
            <i>↗</i>
          </header>
          <strong>{money(billableCount ? Math.round(pending / billableCount) : 0)}</strong>
          <small>PER LEAD</small>
        </article>
      </div>

      <div className="dashGrid">
        <article className="dashPanel formPanel">
          <header>
            <span>STRIPE CONNECT</span>
            <h2>Payout account</h2>
          </header>
          <p className="formLede">
            Express onboarding collects bank details so Qentrax can transfer publisher payables when a
            payout batch is released.
          </p>
          {orgFull?.stripe_connect_account_id && (
            <p style={{ padding: "0 20px", color: "#718287", fontSize: 12 }}>
              Account: {orgFull.stripe_connect_account_id}
            </p>
          )}
          {stripeReady ? (
            <form action={startConnectOnboarding} className="workspace-actions">
              <input type="hidden" name="organization_id" value={org.id} />
              <button className="dashAction" type="submit">
                {orgFull?.stripe_connect_account_id
                  ? payoutsOk
                    ? "UPDATE STRIPE ACCOUNT"
                    : "CONTINUE ONBOARDING"
                  : "CONNECT WITH STRIPE"}
              </button>
            </form>
          ) : (
            <p style={{ padding: "0 20px 20px", color: "#718287", fontSize: 13 }}>
              Stripe keys not configured in this environment.
            </p>
          )}
        </article>

        <article className="dashPanel">
          <header>
            <span>PAYABLE LEDGER</span>
            <h2>Credits to publisher payable</h2>
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
              <span className="status">No payable entries yet.</span>
            </div>
          )}
        </article>
      </div>
    </WorkspaceShell>
  );
}
