import { redirect } from "next/navigation";
import Link from "next/link";
import WorkspaceShell from "@/components/WorkspaceShell";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/workspace-data";
import { LEAD_TYPES, PRICING_MODES } from "@/lib/offers/offer-input";
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

    // Only published schema versions may back an offer version.
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
      title="Offers"
      subtitle="Publish what the network sells, and the terms it sells on."
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
                <option value="" disabled>
                  Choose a vertical
                </option>
                {(verticals ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
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
                <span>VERSION</span>
                <span>STATUS</span>
                <span>PRICING</span>
                <span>PUBLISHED</span>
              </div>
              {versions.map((v) => (
                <div className="tableRow report" key={v.id}>
                  <span>
                    v{v.version}
                    {v.id === selected.current_version_id && " · LIVE"}
                  </span>
                  <span className="status">{v.status.toUpperCase()}</span>
                  <span>
                    {v.pricing_mode}
                    {v.price_cents != null && ` ${money(v.price_cents)}`}
                    {v.floor_cents != null && ` floor ${money(v.floor_cents)}`}
                  </span>
                  <span>{v.published_at ? v.published_at.slice(0, 10) : "—"}</span>
                </div>
              ))}
              {!versions.length && (
                <div className="tableRow">
                  <span className="status">No versions yet. Create the first below.</span>
                </div>
              )}

              {draft && (
                <form action={publishOffer} className="stackForm">
                  <input type="hidden" name="offer_id" value={selected.id} />
                  <input type="hidden" name="version_id" value={draft.id} />
                  <p className="hint">
                    Publishing freezes v{draft.version} and makes it the live version.
                  </p>
                  <button type="submit">PUBLISH v{draft.version}</button>
                </form>
              )}

              {!draft && live && (
                <form action={openOfferDraft} className="stackForm">
                  <input type="hidden" name="offer_id" value={selected.id} />
                  <label>
                    Draft notes
                    <input name="notes" placeholder="Reprice, widen geography…" />
                  </label>
                  <p className="hint">
                    Opens a new draft cloned from v{live.version}; published terms are
                    never edited in place.
                  </p>
                  <button type="submit">OPEN NEW DRAFT</button>
                </form>
              )}

              {selected.status !== "draft" && (
                <form action={setOfferStatus} className="stackForm">
                  <input type="hidden" name="offer_id" value={selected.id} />
                  <label>
                    Marketplace status
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
        <article className="dashPanel">
          <header>
            <span>{draft ? `EDIT DRAFT v${draft.version}` : "FIRST VERSION"}</span>
            <h2>Offer terms</h2>
          </header>

          {publishedSchemas.length === 0 ? (
            <div className="emptyState">
              <p>This vertical has no published schema version.</p>
              <small>
                Publish a schema in <Link href="/workspace/admin/verticals">Verticals</Link> before
                an offer can define its payload contract.
              </small>
            </div>
          ) : (
            <form
              action={draft ? updateDraftVersion : createFirstVersion}
              className="stackForm fieldBuilder"
            >
              <input type="hidden" name="offer_id" value={selected.id} />
              {draft && <input type="hidden" name="version_id" value={draft.id} />}
              <div className="formGrid">
                <label>
                  Schema version
                  <select
                    name="schema_version_id"
                    defaultValue={draft?.schema_version_id ?? publishedSchemas[0]?.id}
                  >
                    {publishedSchemas.map((s) => (
                      <option key={s.id} value={s.id}>
                        schema v{s.version}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Lead type
                  <select name="lead_type" defaultValue={draft?.lead_type ?? "exclusive"}>
                    {LEAD_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Pricing mode
                  <select name="pricing_mode" defaultValue={draft?.pricing_mode ?? "fixed"}>
                    {PRICING_MODES.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Price ($)
                  <input name="price" placeholder="45.00" defaultValue={dollars(draft?.price_cents ?? null)} />
                </label>
                <label>
                  Floor ($)
                  <input name="floor" defaultValue={dollars(draft?.floor_cents ?? null)} />
                </label>
                <label>
                  Ceiling ($)
                  <input name="ceiling" defaultValue={dollars(draft?.ceiling_cents ?? null)} />
                </label>
                <label>
                  Include states
                  <input
                    name="states_include"
                    placeholder="CA, NV"
                    defaultValue={(draft ? geoStates(draft).include ?? [] : []).join(", ")}
                  />
                </label>
                <label>
                  Exclude states
                  <input
                    name="states_exclude"
                    defaultValue={(draft ? geoStates(draft).exclude ?? [] : []).join(", ")}
                  />
                </label>
                <label>
                  Include ZIPs
                  <input name="zips_include" placeholder="90210, 94110" />
                </label>
                <label>
                  Exclude ZIPs
                  <input name="zips_exclude" />
                </label>
                <label>
                  Max lead age (minutes)
                  <input
                    name="max_lead_age_minutes"
                    type="number"
                    defaultValue={
                      draft?.max_lead_age_seconds ? draft.max_lead_age_seconds / 60 : ""
                    }
                  />
                </label>
                <label>
                  Verification
                  <input name="verification" placeholder="phone_verified" />
                </label>
                <label>
                  Min quality score
                  <input name="min_quality_score" type="number" min="0" max="100" />
                </label>
                <label>
                  Return window (hours)
                  <input name="return_window_hours" type="number" />
                </label>
                <label className="wide">
                  Accepted return reasons
                  <input name="return_reasons" placeholder="duplicate, invalid_phone" />
                </label>
                <label className="inlineCheck">
                  <input
                    type="checkbox"
                    name="require_consent"
                    defaultChecked={Boolean(draft?.requirements_json?.consent_required)}
                  />
                  Require consent evidence
                </label>
              </div>
              <button type="submit">{draft ? "SAVE DRAFT" : "CREATE VERSION 1"}</button>
            </form>
          )}
        </article>
      )}
    </WorkspaceShell>
  );
}
