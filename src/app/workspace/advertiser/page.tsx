import { isBillable } from "@/lib/reporting/transaction-status";
import Link from "next/link";
import { redirect } from "next/navigation";
import WorkspaceDashboard from "@/components/WorkspaceDashboard";
import { createClient } from "@/lib/supabase/server";
import { PRIMARY_VERTICALS } from "@/lib/verticals";
import { activateCampaign, createCampaign, postTestFunding } from "./actions";

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
      .join("") || "AD"
  );
}

export default async function AdvertiserWorkspace({
  searchParams,
}: {
  searchParams: Promise<{
    org?: string;
    funded?: string;
    fund_error?: string;
    activated?: string;
    activate?: string;
  }>;
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

  if (orgError || !org || org.type !== "advertiser") redirect("/workspace");

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, status, base_bid_cents, daily_budget_cents, created_at")
    .eq("advertiser_org_id", orgId)
    .order("created_at", { ascending: false });

  const { data: balance } = await supabase.rpc("advertiser_available_balance_cents", {
    p_organization_id: orgId,
  });

  const { data: txns } = await supabase
    .from("transactions")
    .select("id, status, advertiser_price_cents, created_at, opportunity_id")
    .eq("advertiser_org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(8);

  const oppIds = (txns ?? []).map((t) => t.opportunity_id).filter(Boolean) as string[];
  const { data: opps } =
    oppIds.length > 0
      ? await supabase.from("opportunities").select("id, public_transaction_id").in("id", oppIds)
      : { data: [] as { id: string; public_transaction_id: string }[] };
  const oppMap = new Map((opps ?? []).map((o) => [o.id, o.public_transaction_id]));

  const bal = Number(balance ?? 0);
  const spend = (txns ?? []).reduce((s, t) => s + (t.advertiser_price_cents ?? 0), 0);
  const accepted = (txns ?? []).filter((t) => isBillable(t.status)).length;
  const activeCampaigns = (campaigns ?? []).filter((c) => c.status === "active").length;

  const rows = (txns ?? []).map((t) => ({
    id: (t.opportunity_id && oppMap.get(t.opportunity_id)) || t.id.slice(0, 8),
    vertical: "—",
    score: "—",
    status: (t.status ?? "").toUpperCase(),
    value: money(t.advertiser_price_cents),
  }));

  const campaignRows =
    rows.length > 0
      ? rows
      : (campaigns ?? []).map((c) => ({
          id: c.id.slice(0, 8),
          vertical: "CAMPAIGN",
          score: money(c.base_bid_cents),
          status: c.status.toUpperCase(),
          value: c.daily_budget_cents != null ? money(c.daily_budget_cents) : "—",
        }));

  const notice =
    params.funded
      ? "Test funding posted to ledger."
      : params.fund_error
        ? "Funding failed. Minimum $500; must be advertiser member."
        : params.activated
          ? "Campaign activated."
          : params.activate
            ? `Activation blocked: ${params.activate}. Approve org and fund first.`
            : null;

  return (
    <WorkspaceDashboard
      role="advertiser"
      orgId={orgId}
      orgName={org.legal_name}
      orgStatus={org.onboarding_status}
      initials={initials(org.legal_name)}
      subtitle={
        notice ??
        `${activeCampaigns} active campaign${activeCampaigns === 1 ? "" : "s"} · ${accepted} billable in view.`
      }
      stats={[
        {
          label: "AVAILABLE BALANCE",
          icon: "◫",
          value: money(bal),
          meta: bal > 0 ? "FUNDED" : "UNFUNDED",
        },
        {
          label: "SPEND (VIEW)",
          icon: "↗",
          value: money(spend),
          meta: `${(txns ?? []).length} txns`,
        },
        {
          label: "BILLABLE LEADS",
          icon: "◎",
          value: String(accepted),
          meta: org.onboarding_status,
        },
        {
          label: "CAMPAIGNS",
          icon: "⌁",
          value: String((campaigns ?? []).length),
          meta: `${activeCampaigns} active`,
        },
      ]}
      healthScore={org.onboarding_status === "approved" ? (bal > 0 ? "92" : "71") : "48"}
      rows={campaignRows}
      listTitle="LIVE ACTIVITY"
      listSubtitle={rows.length ? "Recent billable transactions" : "Campaigns"}
      primaryAction={
        <Link className="dashAction" href={`/workspace/advertiser?org=${orgId}#create`}>
          ＋ NEW CAMPAIGN
        </Link>
      }
      secondaryPanel={
        <div className="workspace-actions">
          {notice && <p className="notice">{notice}</p>}
          <form action={postTestFunding}>
            <input type="hidden" name="organization_id" value={orgId} />
            <input type="hidden" name="amount_cents" value={50000} />
            <button className="quickRow" type="submit">
              <i>$</i>
              <span>
                <b>Post $500 test funding</b>
                <small>Balanced ledger journal (Stripe later)</small>
              </span>
              <em>→</em>
            </button>
          </form>
          <form action={createCampaign} id="create">
            <input type="hidden" name="organization_id" value={orgId} />
            <label>
              Campaign name
              <input name="name" required placeholder="CA auto — exclusive" />
            </label>
            <label>
              Vertical
              <select name="vertical_code" defaultValue="auto_insurance" required>
                {PRIMARY_VERTICALS.map((v) => (
                  <option key={v.code} value={v.code}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              States (optional, comma-separated)
              <input name="states" placeholder="CA,TX,AZ" />
            </label>
            <label>
              Base bid (cents)
              <input name="base_bid_cents" type="number" min={0} defaultValue={2500} />
            </label>
            <label>
              Daily budget (cents)
              <input name="daily_budget_cents" type="number" min={0} defaultValue={50000} />
            </label>
            <button
              className="dashAction"
              type="submit"
              style={{ width: "100%", justifyContent: "center" }}
            >
              Create draft campaign
            </button>
          </form>
          {(campaigns ?? [])
            .filter((c) => c.status !== "active")
            .slice(0, 3)
            .map((c) => (
              <form action={activateCampaign} key={c.id}>
                <input type="hidden" name="organization_id" value={orgId} />
                <input type="hidden" name="campaign_id" value={c.id} />
                <button className="quickRow" type="submit">
                  <i>◎</i>
                  <span>
                    <b>Activate {c.name}</b>
                    <small>
                      {c.status} · bid {money(c.base_bid_cents)}
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
