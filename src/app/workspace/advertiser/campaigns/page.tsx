import Link from "next/link";
import WorkspaceShell from "@/components/WorkspaceShell";
import { initials, money, requireOrg } from "@/lib/workspace-data";
import { activateCampaign, createCampaign } from "../actions";
import { PRIMARY_VERTICALS } from "@/lib/verticals";

export default async function AdvertiserCampaigns({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org: orgId } = await searchParams;
  const { supabase, org } = await requireOrg(orgId, "advertiser");

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select(
      "id, name, status, base_bid_cents, daily_budget_cents, vertical_id, targeting_json, created_at",
    )
    .eq("advertiser_org_id", org.id)
    .order("created_at", { ascending: false });

  const { data: verticals } = await supabase.from("verticals").select("id, code, name");
  const vMap = new Map((verticals ?? []).map((v) => [v.id, v.name]));

  return (
    <WorkspaceShell
      role="advertiser"
      orgId={org.id}
      orgName={org.legal_name}
      orgStatus={org.onboarding_status}
      initials={initials(org.legal_name)}
      active="campaigns"
      eyebrow="DEMAND COMMAND"
      title="Campaigns"
      subtitle="Create, fund, and activate demand campaigns by vertical."
      primaryAction={
        <Link className="dashAction" href={`#create`}>
          ＋ NEW CAMPAIGN
        </Link>
      }
    >
      <div className="dashPanel">
        <div className="tableHead campaigns">
          <span>NAME</span>
          <span>VERTICAL</span>
          <span>BID</span>
          <span>DAILY BUDGET</span>
          <span>STATUS</span>
          <span>ACTION</span>
        </div>
        {(campaigns ?? []).map((c) => (
          <div className="tableRow campaigns" key={c.id}>
            <span>{c.name}</span>
            <span>{c.vertical_id ? vMap.get(c.vertical_id) ?? "—" : "Any"}</span>
            <span>{money(c.base_bid_cents)}</span>
            <span>{c.daily_budget_cents != null ? money(c.daily_budget_cents) : "—"}</span>
            <span className="status">{c.status.toUpperCase()}</span>
            <span>
              {c.status !== "active" ? (
                <form action={activateCampaign}>
                  <input type="hidden" name="organization_id" value={org.id} />
                  <input type="hidden" name="campaign_id" value={c.id} />
                  <button type="submit" className="dashGhost">
                    Activate
                  </button>
                </form>
              ) : (
                "Live"
              )}
            </span>
          </div>
        ))}
        {!campaigns?.length && (
          <div className="tableRow">
            <span className="status">No campaigns yet — create one below.</span>
          </div>
        )}
      </div>

      <article className="dashPanel formPanel" id="create">
        <header>
          <span>NEW CAMPAIGN</span>
          <h2>Draft a demand campaign</h2>
        </header>
        <form action={createCampaign} className="workspace-actions">
          <input type="hidden" name="organization_id" value={org.id} />
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
            States (optional)
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
          <button className="dashAction" type="submit">
            Create draft campaign
          </button>
        </form>
      </article>
    </WorkspaceShell>
  );
}
