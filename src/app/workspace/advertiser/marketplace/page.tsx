import Link from "next/link";
import WorkspaceShell from "@/components/WorkspaceShell";
import { initials, money, requireOrg } from "@/lib/workspace-data";

type OfferRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  vertical_id: string;
  published_at: string | null;
  verticals: { code: string; name: string } | null;
  offer_versions: {
    version: number;
    lead_type: string;
    pricing_mode: string;
    price_cents: number | null;
    floor_cents: number | null;
    geo_rules_json: { states?: { include?: string[]; exclude?: string[] } };
  } | null;
};

function priceLabel(v: OfferRow["offer_versions"]) {
  if (!v) return "—";
  if (v.price_cents != null) return money(v.price_cents);
  if (v.floor_cents != null) return `from ${money(v.floor_cents)}`;
  return v.pricing_mode;
}

function geoLabel(v: OfferRow["offer_versions"]) {
  const states = v?.geo_rules_json?.states;
  if (!states) return "Nationwide";
  if (states.include?.length) return states.include.join(", ");
  if (states.exclude?.length) return `All except ${states.exclude.join(", ")}`;
  return "Nationwide";
}

export default async function AdvertiserMarketplace({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; vertical?: string }>;
}) {
  const params = await searchParams;
  const { supabase, org } = await requireOrg(params.org, "advertiser");

  // RLS on offers and offer_versions restricts this to published rows, so an
  // unpublished or paused offer never reaches the marketplace listing.
  let query = supabase
    .from("offers")
    .select(
      `id, name, slug, description, vertical_id, published_at,
       verticals ( code, name ),
       offer_versions!offers_current_version_id_fkey (
         version, lead_type, pricing_mode, price_cents, floor_cents, geo_rules_json
       )`,
    )
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (params.vertical) query = query.eq("vertical_id", params.vertical);

  const { data } = await query;
  const offers = (data ?? []) as unknown as OfferRow[];

  const { data: verticals } = await supabase
    .from("verticals")
    .select("id, name")
    .eq("active", true)
    .order("name");

  const base = `/workspace/advertiser/marketplace?org=${org.id}`;

  return (
    <WorkspaceShell
      role="advertiser"
      orgId={org.id}
      orgName={org.legal_name}
      orgStatus={org.onboarding_status}
      initials={initials(org.legal_name)}
      active="marketplace"
      eyebrow="MARKETPLACE"
      title="Browse offers"
      subtitle="Every offer publishes its complete lead specification before you buy."
    >
      <div className="reportControls">
        <div className="rangeTabs">
          <Link href={base} className={params.vertical ? "rangeTab" : "rangeTab active"}>
            ALL
          </Link>
          {(verticals ?? []).map((v) => (
            <Link
              key={v.id}
              href={`${base}&vertical=${v.id}`}
              className={params.vertical === v.id ? "rangeTab active" : "rangeTab"}
            >
              {v.name.toUpperCase()}
            </Link>
          ))}
        </div>
        <span className="rangeMeta">
          {offers.length} live offer{offers.length === 1 ? "" : "s"}
        </span>
      </div>

      {offers.length === 0 ? (
        <article className="dashPanel">
          <div className="emptyState">
            <p>No published offers in this view.</p>
            <small>Offers appear here once the network publishes them.</small>
          </div>
        </article>
      ) : (
        <div className="offerGrid">
          {offers.map((o) => (
            <article className="offerCard" key={o.id}>
              <header>
                <span className="status">{o.verticals?.name ?? "—"}</span>
                <h2>{o.name}</h2>
              </header>
              <p>{o.description ?? "No description provided."}</p>
              <dl>
                <div>
                  <dt>PRICE</dt>
                  <dd>{priceLabel(o.offer_versions)}</dd>
                </div>
                <div>
                  <dt>LEAD TYPE</dt>
                  <dd>{o.offer_versions?.lead_type ?? "—"}</dd>
                </div>
                <div>
                  <dt>GEOGRAPHY</dt>
                  <dd>{geoLabel(o.offer_versions)}</dd>
                </div>
              </dl>
              <Link
                className="offerCta"
                href={`/workspace/advertiser/marketplace/${o.slug}?org=${org.id}`}
              >
                VIEW LEAD SPECIFICATION →
              </Link>
            </article>
          ))}
        </div>
      )}
    </WorkspaceShell>
  );
}
