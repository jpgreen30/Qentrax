import { redirect } from "next/navigation";
import Link from "next/link";
import WorkspaceShell from "@/components/WorkspaceShell";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/workspace-data";
import { LEAD_TYPES, PRICING_MODES } from "@/lib/offers/offer-input";
import OfferBuilderFields from "@/components/offer-builder/OfferBuilderFields";
import {
  createOffer,
  createFirstVersion,
  updateDraftVersion,
  openOfferDraft,
  publishOffer,
  setOfferStatus,
} from "./actions";

type OfferVersionRow = {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  lead_type: string;
  pricing_mode: string;
  price_cents: number | null;
  floor_cents: number | null;
  ceiling_cents: number | null;
  geo_rules_json: { states?: { include?: string[]; exclude?: string[] } };
  requirements_json: Record<string, unknown>;
  return_policy_json: Record<string, unknown>;
  max_lead_age_seconds: number | null;
  schema_version_id: string;
  published_at: string | null;
};

const dollars = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));

export default async function AdminOffers({
  searchParams,
}: {
  searchParams: Promise<{ offer?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/sign-in");
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/workspace");

  const { data: offers } = await supabase
    .from("offers")
    .select("id, name, slug, description, status, vertical_id, current_version_id")
    .order("created_at", { ascending: false });

  const { data: verticals } = await supabase
    .from("verticals")
    .select("id, code, name")
    .eq("active", true)
    .order("name");

  const selectedId = params.offer ?? offers?.[0]?.id ?? null;
  const selected = (offers ?? []).find((o) => o.id === selectedId) ?? null;

  let versions: OfferVersionRow[] = [];
  let publishedSchemas: { id: string; version: number; vertical_id: string }[] = [];

  if (selected) {
    const { data: versionRows } = await supabase
      .from("offer_versions")
      .select(
        `id, version, status, lead_type, pricing_mode, price_cents, floor_cents,
         ceiling_cents, geo_rules_json, requirements_json, return_policy_json,
         max_lead_age_seconds, schema_version_id, published_at`,
      )
      .eq("offer_id", selected.id)
      .order("version", { ascending: false });
    versions = (versionRows ?? []) as OfferVersionRow[];

    const { data: schemaRows } = await supabase
      .from("vertical_schema_versions")
      .select("id, version, vertical_id")
      .eq("vertical_id", selected.vertical_id)
      .eq("status", "published")
      .order("version", { ascending: false });
    publishedSchemas = schemaRows ?? [];
  }

  const draft = versions.find((v) => v.status === "draft") ?? null;
  const live = versions.find((v) => v.id === selected?.current_version_id) ?? null;
  const geoStates = (v: OfferVersionRow) => v.geo_rules_json?.states ?? {};

  return (
    <WorkspaceShell
      role="admin"
      orgName="Qentrax"
      initials="QX"
      active="offers"
      eyebrow="MARKETPLACE"
      title="Build a lead product"
      subtitle="Define the payload, buyer controls, economics and compliance rules that become a versioned marketplace offer."
    >
      {params.error && <div className="formError">{params.error}</div>}

      <div className="dashGrid">
        <article className="dashPanel">
          <header>
            <span>OFFERS</span>
            <h2>Catalog</h2>
          </header>
          {(offers ?? []).map((o) => (
            <Link
              key={o.id}
              href={`/workspace/admin/offers?offer=${o.id}`}
              className={o.id === selectedId ? "tableRow vertRow active" : "tableRow vertRow"}
            >
              <span>{o.name}</span>
              <span className="status">{o.slug}</span>
              <span className="status">{o.status.toUpperCase()}</span>
            </Link>
          ))}
          {!offers?.length && (
            <div className="tableRow">
              <span className="status">No offers yet.</span>
            </div>
          )}

          <form action={createOffer} className="stackForm">
            <h3>New offer</h3>
            <label>
              Vertical
              <select name="vertical_id" required defaultValue="">
                <option value="" disabled>Choose a vertical</option>
                {(verticals ?? []).map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </label>
            <label>
              Name
              <input name="name" required placeholder="California Solar Exclusive" />
            </label>
            <label>
              Slug
              <input name="slug" required placeholder="ca-solar-exclusive" />
            </label>
            <label>
              Description
              <textarea name="description" rows={2} />
            </label>
            <button type="submit">CREATE OFFER</button>
          </form>
        </article>

        <article className="dashPanel">
          <header>
            <span>LIFECYCLE</span>
            <h2>{selected ? selected.name : "Select an offer"}</h2>
          </header>
          {selected && (
            <>
              <div className="tableHead report">
                <span>VERSION</span><span>STATUS</span><span>PRICING</span><span>PUBLISHED</span>
              </div>
              {versions.map((v) => (
                <div className="tableRow report" key={v.id}>
                  <span>v{v.version}{v.id === selected.current_version_id && " · LIVE"}</span>
                  <span className="status">{v.status.toUpperCase()}</span>
                  <span>
                    {v.pricing_mode}
                    {v.price_cents != null && ` ${money(v.price_cents)}`}
                    {v.floor_cents != null && ` floor ${money(v.floor_cents)}`}
                  </span>
                  <span>{v.published_at ? v.published_at.slice(0, 10) : "—"}</span>
                </div>
              ))}
              {draft && (
                <form action={publishOffer} className="stackForm">
                  <input type="hidden" name="offer_id" value={selected.id} />
                  <input type="hidden" name="version_id" value={draft.id} />
                  <button type="submit">PUBLISH v{draft.version}</button>
                </form>
              )}
              {!draft && live && (
                <form action={openOfferDraft} className="stackForm">
                  <input type="hidden" name="offer_id" value={selected.id} />
                  <label>Draft notes<input name="notes" /></label>
                  <button type="submit">OPEN NEW DRAFT</button>
                </form>
              )}
              {selected.status !== "draft" && (
                <form action={setOfferStatus} className="stackForm">
                  <input type="hidden" name="offer_id" value={selected.id} />
                  <label>Marketplace status
                    <select name="status" defaultValue={selected.status}>
                      <option value="published">published</option>
                      <option value="paused">paused</option>
                      <option value="archived">archived</option>
                    </select>
                  </label>
                  <button type="submit">UPDATE STATUS</button>
                </form>
              )}
            </>
          )}
        </article>
      </div>

      {selected && (draft || !versions.length) && (
        <article className="dashPanel formPanel">
          {publishedSchemas.length === 0 ? (
            <div className="emptyState">
              <p>This vertical has no published schema version.</p>
              <small>Publish a schema in <Link href="/workspace/admin/verticals">Verticals</Link> first.</small>
            </div>
          ) : (
            <form action={draft ? updateDraftVersion : createFirstVersion}>
              <input type="hidden" name="offer_id" value={selected.id} />
              {draft && <input type="hidden" name="version_id" value={draft.id} />}
              <OfferBuilderFields
                offerName={selected.name}
                schemas={publishedSchemas}
                leadTypes={LEAD_TYPES}
                pricingModes={PRICING_MODES}
                submitLabel={draft ? "Save draft" : "Create version 1"}
                draft={{
                  schema_version_id: draft?.schema_version_id,
                  lead_type: draft?.lead_type,
                  pricing_mode: draft?.pricing_mode,
                  price: dollars(draft?.price_cents ?? null),
                  floor: dollars(draft?.floor_cents ?? null),
                  ceiling: dollars(draft?.ceiling_cents ?? null),
                  states_include: (draft ? geoStates(draft).include ?? [] : []).join(", "),
                  states_exclude: (draft ? geoStates(draft).exclude ?? [] : []).join(", "),
                  max_lead_age_minutes: draft?.max_lead_age_seconds ? String(draft.max_lead_age_seconds / 60) : "5",
                  verification: String(draft?.requirements_json?.verification ?? ""),
                  min_quality_score: String(draft?.requirements_json?.min_quality_score ?? ""),
                  return_window_hours: String((draft?.return_policy_json?.window_hours as number | undefined) ?? "72"),
                  return_reasons: Array.isArray(draft?.return_policy_json?.accepted_reasons)
                    ? (draft.return_policy_json.accepted_reasons as string[]).join(", ")
                    : "",
                  require_consent: Boolean(draft?.requirements_json?.consent_required),
                  field_profile: String(draft?.requirements_json?.field_profile ?? "short"),
                }}
              />
            </form>
          )}
        </article>
      )}
    </WorkspaceShell>
  );
}
