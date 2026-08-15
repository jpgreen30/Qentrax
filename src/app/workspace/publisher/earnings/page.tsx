import WorkspaceShell from "@/components/WorkspaceShell";
import { initials, money, requireOrg } from "@/lib/workspace-data";

export default async function PublisherEarnings({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org: orgId } = await searchParams;
  const { supabase, org } = await requireOrg(orgId, "publisher");

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
      subtitle="Payable balance from billable leads. Net-30 batch payouts come next."
    >
      <div className="dashStats">
        <article>
          <header>
            <span>PENDING PAYABLE</span>
            <i>$</i>
          </header>
          <strong>{money(pending)}</strong>
          <small>NET 30 (STUB)</small>
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
            <span>LEDGER ENTRIES</span>
            <i>↗</i>
          </header>
          <strong>{(entries ?? []).length}</strong>
          <small>RECENT</small>
        </article>
        <article>
          <header>
            <span>AVG RPL</span>
            <i>⌁</i>
          </header>
          <strong>{money(billableCount ? Math.round(pending / billableCount) : 0)}</strong>
          <small>PER LEAD</small>
        </article>
      </div>

      <div className="dashPanel">
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
      </div>
    </WorkspaceShell>
  );
}
