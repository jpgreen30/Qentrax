import Link from "next/link";
import { notFound } from "next/navigation";
import WorkspaceShell from "@/components/WorkspaceShell";
import { initials, money, requireOrg } from "@/lib/workspace-data";
import { DAY_LABELS, minutesToTime } from "@/lib/campaigns/campaign-input";
import { activateCampaign } from "../../new/actions";

const dayLabel = (n: number) =>
  DAY_LABELS.find((d) => d.value === n)?.label ?? String(n);

export default async function CampaignReview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ org?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase, org } = await requireOrg(query.org, "advertiser");

  const { data: campaign } = await supabase
    .from("campaigns")
    .select(
      `id, name, status, timezone, base_bid_cents, daily_cap, hourly_cap, monthly_cap,
       daily_budget_cents, monthly_budget_cents, pacing, targeting_json,
       offer_id, offer_version_id,
       offers ( name, slug ),
       offer_versions!campaigns_offer_version_id_fkey (
         version, lead_type, pricing_mode, price_cents, floor_cents
       )`,
    )
    .eq("id", id)
    .eq("advertiser_org_id", org.id)
    .maybeSingle();

  if (!campaign) notFound();

  const { data: dayparts } = await supabase
    .from("campaign_dayparts")
    .select("day_of_week, start_minute, end_minute")
    .eq("campaign_id", id)
    .order("day_of_week");

  const { data: endpoints } = await supabase
    .from("campaign_endpoints")
    .select("type, endpoint_url, status")
    .eq("campaign_id", id);

  const offer = campaign.offers as unknown as { name: string; slug: string } | null;
  const version = campaign.offer_versions as unknown as {
    version: number; lead_type: string; pricing_mode: string;
  } | null;
  const targeting = (campaign.targeting_json ?? {}) as { states?: string[]; zips?: string[] };

  const cap = (v: number | null) => (v == null ? "No limit" : String(v));
  const budget = (v: number | null) => (v == null ? "No limit" : money(v));

  // Activation is blocked while anything required is missing, so a campaign
  // cannot start buying half-configured.
  const blockers: string[] = [];
  if (!campaign.offer_version_id) blockers.push("No offer version is pinned.");
  if (!campaign.base_bid_cents) blockers.push("No bid is set.");
  if (!endpoints?.length) {
    blockers.push("No delivery integration is attached; leads would have nowhere to go.");
  }

  return (
    <WorkspaceShell
      role="advertiser"
      orgId={org.id}
      orgName={org.legal_name}
      orgStatus={org.onboarding_status}
      initials={initials(org.legal_name)}
      active="campaigns"
      eyebrow="FINAL REVIEW"
      title={campaign.name}
      subtitle="Confirm the full buying configuration before this campaign starts buying."
    >
      {query.error && <div className="formError">{query.error}</div>}

      <div className="reportControls">
        <Link className="rangeTab" href={`/workspace/advertiser/campaigns?org=${org.id}`}>
          ← ALL CAMPAIGNS
        </Link>
        <span className="rangeMeta">
          status {campaign.status.toUpperCase()}
          {version && ` · offer v${version.version}`}
        </span>
      </div>

      <div className="dashStats">
        <article>
          <header><span>BID</span><i>$</i></header>
          <strong>{money(campaign.base_bid_cents)}</strong>
          <small>{version?.pricing_mode?.toUpperCase() ?? "—"}</small>
        </article>
        <article>
          <header><span>DAILY BUDGET</span><i>▦</i></header>
          <strong>{budget(campaign.daily_budget_cents)}</strong>
          <small>MONTHLY {budget(campaign.monthly_budget_cents)}</small>
        </article>
        <article>
          <header><span>DAILY CAP</span><i>◎</i></header>
          <strong>{cap(campaign.daily_cap)}</strong>
          <small>HOURLY {cap(campaign.hourly_cap)} · MONTHLY {cap(campaign.monthly_cap)}</small>
        </article>
        <article>
          <header><span>PACING</span><i>⌁</i></header>
          <strong>{campaign.pacing}</strong>
          <small>{campaign.timezone}</small>
        </article>
      </div>

      <article className="dashPanel">
        <header>
          <span>CONFIGURATION</span>
          <h2>What this campaign buys</h2>
        </header>
        <div className="termsGrid">
          <div>
            <dt>Offer</dt>
            <dd>
              {offer ? (
                <Link href={`/workspace/advertiser/marketplace/${offer.slug}?org=${org.id}`}>
                  {offer.name}
                </Link>
              ) : "—"}
            </dd>
          </div>
          <div><dt>Offer version</dt><dd>v{version?.version ?? "—"} (pinned)</dd></div>
          <div><dt>Lead type</dt><dd>{version?.lead_type ?? "—"}</dd></div>
          <div><dt>States</dt><dd>{targeting.states?.join(", ") || "Nationwide"}</dd></div>
          <div><dt>ZIP codes</dt><dd>{targeting.zips?.join(", ") || "—"}</dd></div>
          <div><dt>Timezone</dt><dd>{campaign.timezone}</dd></div>
          <div>
            <dt>Schedule</dt>
            <dd>
              {dayparts?.length
                ? dayparts
                    .map((d) =>
                      `${dayLabel(d.day_of_week)} ${minutesToTime(d.start_minute)}–${minutesToTime(d.end_minute)}`)
                    .join(", ")
                : "All hours"}
            </dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>
              {endpoints?.length
                ? endpoints.map((e) => `${e.type} → ${e.endpoint_url}`).join(", ")
                : "None attached"}
            </dd>
          </div>
        </div>
      </article>

      <article className="dashPanel">
        <header>
          <span>ACTIVATION</span>
          <h2>{campaign.status === "active" ? "Campaign is live" : "Ready to activate"}</h2>
        </header>
        {blockers.length > 0 ? (
          <div className="stackForm">
            <p className="hint">This campaign cannot be activated yet:</p>
            <ul className="blockerList">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ) : campaign.status === "active" ? (
          <div className="stackForm">
            <p className="hint">
              This campaign is buying. Caps, budgets and the schedule are enforced on
              every routing decision.
            </p>
          </div>
        ) : (
          <form action={activateCampaign} className="stackForm">
            <input type="hidden" name="org_id" value={org.id} />
            <input type="hidden" name="campaign_id" value={campaign.id} />
            <p className="hint">
              Activating starts buying immediately, subject to the caps, budgets and
              schedule above.
            </p>
            <button type="submit">ACTIVATE CAMPAIGN</button>
          </form>
        )}
      </article>
    </WorkspaceShell>
  );
}
