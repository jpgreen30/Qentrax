import Link from "next/link";
import WorkspaceShell from "@/components/WorkspaceShell";
import { initials, money, requireOrg } from "@/lib/workspace-data";
import {
  DAY_LABELS,
  SUPPORTED_TIMEZONES,
  PACING_MODES,
} from "@/lib/campaigns/campaign-input";
import { createCampaign } from "./actions";

type Version = {
  id: string;
  version: number;
  lead_type: string;
  pricing_mode: string;
  price_cents: number | null;
  floor_cents: number | null;
  ceiling_cents: number | null;
  geo_rules_json: { states?: { include?: string[] } };
};

export default async function NewCampaign({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; offer?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { supabase, org } = await requireOrg(params.org, "advertiser");

  const { data: offers } = await supabase
    .from("offers")
    .select(
      `id, name, slug, vertical_id,
       offer_versions!offers_current_version_id_fkey (
         id, version, lead_type, pricing_mode, price_cents, floor_cents,
         ceiling_cents, geo_rules_json
       )`,
    )
    .eq("status", "published")
    .order("published_at", { ascending: false });

  const selectedOffer =
    (offers ?? []).find((o) => o.id === params.offer) ?? (offers ?? [])[0] ?? null;
  const version = selectedOffer?.offer_versions as unknown as Version | null;

  const offerStates = version?.geo_rules_json?.states?.include ?? [];

  // A fixed-price offer dictates the bid, so it is prefilled and explained.
  const suggestedBid =
    version?.price_cents != null
      ? (version.price_cents / 100).toFixed(2)
      : version?.floor_cents != null
        ? (version.floor_cents / 100).toFixed(2)
        : "";

  return (
    <WorkspaceShell
      role="advertiser"
      orgId={org.id}
      orgName={org.legal_name}
      orgStatus={org.onboarding_status}
      initials={initials(org.legal_name)}
      active="campaigns"
      eyebrow="CAMPAIGN BUILDER"
      title="New campaign"
      subtitle="Buy against a published offer: targeting, bid, caps, schedule and delivery."
    >
      {params.error && <div className="formError">{params.error}</div>}

      {!offers?.length ? (
        <article className="dashPanel">
          <div className="emptyState">
            <p>No published offers are available to buy against.</p>
            <small>
              Offers appear in the <Link href={`/workspace/advertiser/marketplace?org=${org.id}`}>marketplace</Link> once
              the network publishes them.
            </small>
          </div>
        </article>
      ) : (
        <>
          <article className="dashPanel">
            <header>
              <span>STEP 1 · OFFER</span>
              <h2>What you are buying</h2>
            </header>
            <div className="tableHead report">
              <span>OFFER</span>
              <span>LEAD TYPE</span>
              <span>PRICING</span>
              <span>GEOGRAPHY</span>
            </div>
            {(offers ?? []).map((o) => {
              const v = o.offer_versions as unknown as Version | null;
              const active = o.id === selectedOffer?.id;
              return (
                <Link
                  key={o.id}
                  href={`/workspace/advertiser/campaigns/new?org=${org.id}&offer=${o.id}`}
                  className={active ? "tableRow report active" : "tableRow report"}
                >
                  <span>{o.name}</span>
                  <span className="status">{v?.lead_type ?? "—"}</span>
                  <span>
                    {v?.price_cents != null
                      ? money(v.price_cents)
                      : v?.floor_cents != null
                        ? `floor ${money(v.floor_cents)}`
                        : (v?.pricing_mode ?? "—")}
                  </span>
                  <span>{v?.geo_rules_json?.states?.include?.join(", ") ?? "Nationwide"}</span>
                </Link>
              );
            })}
          </article>

          {selectedOffer && version && (
            <form action={createCampaign}>
              <input type="hidden" name="org_id" value={org.id} />
              <input type="hidden" name="offer_id" value={selectedOffer.id} />

              <article className="dashPanel">
                <header>
                  <span>STEP 2 · TARGETING AND BID</span>
                  <h2>{selectedOffer.name}</h2>
                </header>
                <div className="stackForm">
                  <div className="formGrid">
                    <label className="wide">
                      Campaign name
                      <input name="name" required defaultValue={`${selectedOffer.name} — ${org.legal_name}`} />
                    </label>
                    <label>
                      Bid ($)
                      <input name="base_bid" required defaultValue={suggestedBid} />
                    </label>
                    <label>
                      Pacing
                      <select name="pacing" defaultValue="ASAP">
                        {PACING_MODES.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </label>
                    <label className="wide">
                      States
                      <input
                        name="states"
                        placeholder={offerStates.length ? offerStates.join(", ") : "CA, NV"}
                      />
                    </label>
                    <label className="wide">
                      ZIP codes (optional)
                      <input name="zips" placeholder="90210, 94110" />
                    </label>
                  </div>
                  <p className="hint">
                    {version.pricing_mode === "fixed" && version.price_cents != null
                      ? `This offer is fixed price at ${money(version.price_cents)}; the bid must match.`
                      : version.floor_cents != null
                        ? `Bids must be at least ${money(version.floor_cents)}${
                            version.ceiling_cents != null
                              ? ` and at most ${money(version.ceiling_cents)}`
                              : ""
                          }.`
                        : "This offer prices per ping/post response."}
                    {offerStates.length > 0 &&
                      ` The offer is available in ${offerStates.join(", ")}.`}
                  </p>
                </div>
              </article>

              <article className="dashPanel">
                <header>
                  <span>STEP 3 · CAPS AND BUDGET</span>
                  <h2>Spend controls</h2>
                </header>
                <div className="stackForm">
                  <div className="formGrid">
                    <label>
                      Hourly cap
                      <input name="hourly_cap" type="number" min="0" placeholder="No limit" />
                    </label>
                    <label>
                      Daily cap
                      <input name="daily_cap" type="number" min="0" placeholder="No limit" />
                    </label>
                    <label>
                      Monthly cap
                      <input name="monthly_cap" type="number" min="0" placeholder="No limit" />
                    </label>
                    <label>
                      Daily budget ($)
                      <input name="daily_budget" placeholder="No limit" />
                    </label>
                    <label>
                      Monthly budget ($)
                      <input name="monthly_budget" placeholder="No limit" />
                    </label>
                  </div>
                  <p className="hint">
                    Caps and budgets reset at local midnight in the campaign timezone below,
                    and are enforced atomically so simultaneous leads cannot oversell them.
                  </p>
                </div>
              </article>

              <article className="dashPanel">
                <header>
                  <span>STEP 4 · SCHEDULE</span>
                  <h2>Timezone and dayparts</h2>
                </header>
                <div className="stackForm">
                  <label style={{ maxWidth: 280 }}>
                    Campaign timezone
                    <select name="timezone" defaultValue="America/Los_Angeles">
                      {SUPPORTED_TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </label>
                  <p className="hint">
                    Leave every row blank to run at all hours. Times are local to the
                    campaign timezone; the end time is exclusive.
                  </p>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div className="daypartRow" key={i}>
                      <select name="daypart_day" defaultValue="">
                        <option value="">—</option>
                        {DAY_LABELS.map((d) => (
                          <option key={d.value} value={d.value}>{d.label}</option>
                        ))}
                      </select>
                      <input name="daypart_start" placeholder="09:00" aria-label={`Window ${i + 1} start`} />
                      <input name="daypart_end" placeholder="17:00" aria-label={`Window ${i + 1} end`} />
                    </div>
                  ))}
                </div>
              </article>

              <article className="dashPanel">
                <header>
                  <span>STEP 5 · DELIVERY</span>
                  <h2>Where leads are sent</h2>
                </header>
                <div className="stackForm">
                  <DeliveryPicker orgId={org.id} />
                  <button type="submit">REVIEW CAMPAIGN →</button>
                </div>
              </article>
            </form>
          )}
        </>
      )}
    </WorkspaceShell>
  );
}

async function DeliveryPicker({ orgId }: { orgId: string }) {
  const { supabase } = await requireOrg(orgId, "advertiser");
  // Integrations live in public.connectors; a campaign selects one as its
  // delivery destination.
  const { data: endpoints } = await supabase
    .from("connectors")
    .select("id, name, connector_type, status")
    .eq("organization_id", orgId)
    .in("status", ["active", "testing"]);

  if (!endpoints?.length) {
    return (
      <p className="hint">
        No delivery integration configured yet. The campaign can be created and
        activated once one is connected.
      </p>
    );
  }

  return (
    <label style={{ maxWidth: 380 }}>
      Delivery integration
      <select name="delivery_endpoint_id" defaultValue="">
        <option value="">Choose later</option>
        {endpoints.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name} ({e.connector_type})
          </option>
        ))}
      </select>
    </label>
  );
}
