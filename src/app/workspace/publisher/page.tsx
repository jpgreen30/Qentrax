import { isBillable } from "@/lib/reporting/transaction-status";
import Link from "next/link";
import { redirect } from "next/navigation";
import WorkspaceDashboard from "@/components/WorkspaceDashboard";
import { createClient } from "@/lib/supabase/server";
import { createSource, submitTestOpportunity } from "./actions";

function money(cents: number | null | undefined) {
  return `$${((cents ?? 0) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "PB"
  );
}

export default async function PublisherWorkspace({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; opp?: string; txn?: string; opp_error?: string }>;
}) {
  const params = await searchParams;
  const orgId = params.org;
  if (!orgId) redirect("/workspace");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/sign-in");

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, legal_name, onboarding_status, type")
    .eq("id", orgId)
    .maybeSingle();

  if (orgError || !org || org.type !== "publisher") redirect("/workspace");

  const { data: sources } = await supabase
    .from("publisher_sources")
    .select("id, name, channel, domain, status, created_at")
    .eq("publisher_org_id", orgId)
    .order("created_at", { ascending: false });

  const { data: txns } = await supabase
    .from("transactions")
    .select("id, status, advertiser_price_cents, publisher_amount_cents, created_at, opportunity_id")
    .eq("publisher_org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(10);

  const oppIds = (txns ?? []).map((t) => t.opportunity_id).filter(Boolean) as string[];
  const { data: opps } =
    oppIds.length > 0
      ? await supabase.from("opportunities").select("id, public_transaction_id").in("id", oppIds)
      : { data: [] as { id: string; public_transaction_id: string }[] };
  const oppMap = new Map((opps ?? []).map((o) => [o.id, o.public_transaction_id]));

  const earnings = (txns ?? []).reduce((s, t) => s + (t.publisher_amount_cents ?? 0), 0);
  const billable = (txns ?? []).filter((t) => isBillable(t.status)).length;

  const rows = (txns ?? []).map((t) => ({
    id: (t.opportunity_id && oppMap.get(t.opportunity_id)) || t.id.slice(0, 8),
    vertical: "—",
    score: "—",
    status: (t.status ?? "").toUpperCase(),
    value: money(t.publisher_amount_cents),
  }));

  const sourceRows =
    rows.length > 0
      ? rows
      : (sources ?? []).map((s) => ({
          id: s.id.slice(0, 8),
          vertical: s.channel.toUpperCase(),
          score: s.domain ?? "—",
          status: s.status.toUpperCase(),
          value: "—",
        }));

  const notice =
    params.opp
      ? `Auction result: ${params.opp}${params.txn ? ` · ${params.txn}` : ""}`
      : params.opp_error
        ? "Opportunity or auction failed. Need an active funded campaign."
        : null;

  return (
    <WorkspaceDashboard
      role="publisher"
      orgId={orgId}
      orgName={org.legal_name}
      orgStatus={org.onboarding_status}
      initials={initials(org.legal_name)}
      subtitle={
        notice ??
        `${(sources ?? []).length} source${(sources ?? []).length === 1 ? "" : "s"} · ${billable} billable in view.`
      }
      stats={[
        { label: "EST. EARNINGS", icon: "◫", value: money(earnings), meta: "THIS VIEW" },
        { label: "PENDING PAYOUT", icon: "↗", value: money(earnings), meta: "NET 30 (stub)" },
        { label: "BILLABLE", icon: "◎", value: String(billable), meta: org.onboarding_status },
        {
          label: "SOURCES",
          icon: "⌁",
          value: String((sources ?? []).length),
          meta: `${(sources ?? []).filter((s) => s.status === "active" || s.status === "draft").length} open`,
        },
      ]}
      healthScore={org.onboarding_status === "approved" ? "91" : "52"}
      rows={sourceRows}
      listTitle="LIVE OPPORTUNITIES"
      listSubtitle={rows.length ? "Recent billable transactions" : "Sources"}
      primaryAction={
        <Link className="dashAction" href={`/workspace/publisher?org=${orgId}#create`}>
          ＋ ADD SOURCE
        </Link>
      }
      secondaryPanel={
        <div className="workspace-actions">
          {notice && <p className="notice">{notice}</p>}
          <form action={createSource} id="create">
            <input type="hidden" name="organization_id" value={orgId} />
            <label>
              Source name
              <input name="name" required placeholder="Homepage solar form" />
            </label>
            <label>
              Channel
              <input name="channel" defaultValue="web" />
            </label>
            <label>
              Domain
              <input name="domain" placeholder="example.com" />
            </label>
            <button
              className="dashAction"
              type="submit"
              style={{ width: "100%", justifyContent: "center" }}
            >
              Create draft source
            </button>
          </form>
          {(sources ?? []).slice(0, 4).map((s) => (
            <form action={submitTestOpportunity} key={s.id}>
              <input type="hidden" name="organization_id" value={orgId} />
              <input type="hidden" name="source_id" value={s.id} />
              <button className="quickRow" type="submit">
                <i>◇</i>
                <span>
                  <b>Submit test lead · {s.name}</b>
                  <small>
                    {s.status} · {s.channel}
                  </small>
                </span>
                <em>→</em>
              </button>
            </form>
          ))}
        </div>
      }
    />
  );
}
