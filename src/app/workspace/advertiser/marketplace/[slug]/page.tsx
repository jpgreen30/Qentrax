import Link from "next/link";
import { notFound } from "next/navigation";
import WorkspaceShell from "@/components/WorkspaceShell";
import { initials, money, requireOrg } from "@/lib/workspace-data";
import { buildJsonSchema } from "@/lib/offers/json-schema";
import { buildExamplePayload } from "@/lib/offers/examples";
import type { VerticalField } from "@/lib/offers/types";

type Version = {
  id: string;
  version: number;
  lead_type: string;
  pricing_mode: string;
  price_cents: number | null;
  floor_cents: number | null;
  ceiling_cents: number | null;
  geo_rules_json: {
    states?: { include?: string[]; exclude?: string[] };
    zips?: { include?: string[]; exclude?: string[] };
  };
  requirements_json: Record<string, unknown>;
  return_policy_json: Record<string, unknown>;
  max_lead_age_seconds: number | null;
  schema_version_id: string;
  published_at: string | null;
};

function geoSummary(v: Version) {
  const parts: string[] = [];
  const s = v.geo_rules_json?.states;
  const z = v.geo_rules_json?.zips;
  if (s?.include?.length) parts.push(`States: ${s.include.join(", ")}`);
  if (s?.exclude?.length) parts.push(`Excluding states: ${s.exclude.join(", ")}`);
  if (z?.include?.length) parts.push(`ZIPs: ${z.include.join(", ")}`);
  if (z?.exclude?.length) parts.push(`Excluding ZIPs: ${z.exclude.join(", ")}`);
  return parts.length ? parts.join(" · ") : "Nationwide";
}

export default async function OfferSpecification({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ org?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const { supabase, org } = await requireOrg(query.org, "advertiser");

  const { data: offer } = await supabase
    .from("offers")
    .select(
      `id, name, slug, description, status, vertical_id, current_version_id,
       verticals ( code, name ),
       offer_versions!offers_current_version_id_fkey (
         id, version, lead_type, pricing_mode, price_cents, floor_cents, ceiling_cents,
         geo_rules_json, requirements_json, return_policy_json, max_lead_age_seconds,
         schema_version_id, published_at
       )`,
    )
    .eq("slug", slug)
    .maybeSingle();

  // RLS hides unpublished offers, so a miss here is genuinely not viewable.
  const version = offer?.offer_versions as unknown as Version | null;
  if (!offer || !version) notFound();

  // PostgREST types an embedded relation as an array; this one is to-one.
  const vertical = offer.verticals as unknown as { code: string; name: string } | null;

  const { data: schemaVersion } = await supabase
    .from("vertical_schema_versions")
    .select("id, version, published_at")
    .eq("id", version.schema_version_id)
    .maybeSingle();

  const { data: fieldRows } = await supabase
    .from("vertical_fields")
    .select(
      `field_key, label, description, field_type, required, phase, is_pii,
       consent_classification, enum_values, validation_json, default_value,
       aliases, sort_order`,
    )
    .eq("schema_version_id", version.schema_version_id)
    .order("sort_order");

  const fields = (fieldRows ?? []) as unknown as VerticalField[];
  const meta = {
    offerSlug: offer.slug,
    offerVersion: version.version,
    schemaVersion: schemaVersion?.version ?? 0,
  };

  const pingExample = buildExamplePayload(fields, "ping");
  const postExample = buildExamplePayload(fields, "post");
  const pingSchema = buildJsonSchema(fields, "ping", meta);

  const specBase = `/api/v1/offers/${offer.slug}/specification`;
  const returnWindow = version.return_policy_json?.window_hours;
  const reasons = version.return_policy_json?.accepted_reasons as string[] | undefined;

  return (
    <WorkspaceShell
      role="advertiser"
      orgId={org.id}
      orgName={org.legal_name}
      orgStatus={org.onboarding_status}
      initials={initials(org.legal_name)}
      active="marketplace"
      eyebrow="LEAD SPECIFICATION"
      title={offer.name}
      subtitle={offer.description ?? undefined}
    >
      <div className="reportControls">
        <Link className="rangeTab" href={`/workspace/advertiser/marketplace?org=${org.id}`}>
          ← ALL OFFERS
        </Link>
        <span className="rangeMeta">
          offer v{version.version} · schema v{schemaVersion?.version ?? "—"}
        </span>
        <Link
          className="rangeExport"
          href={`/workspace/advertiser/campaigns/new?org=${org.id}&offer=${offer.id}`}
        >
          CREATE CAMPAIGN →
        </Link>
      </div>

      <div className="dashStats">
        <article>
          <header><span>PRICE</span><i>$</i></header>
          <strong>
            {version.price_cents != null
              ? money(version.price_cents)
              : version.floor_cents != null
                ? money(version.floor_cents)
                : "—"}
          </strong>
          <small>{version.pricing_mode.toUpperCase()}</small>
        </article>
        <article>
          <header><span>LEAD TYPE</span><i>◇</i></header>
          <strong>{version.lead_type}</strong>
          <small>{vertical?.name ?? "—"}</small>
        </article>
        <article>
          <header><span>MAX LEAD AGE</span><i>⌁</i></header>
          <strong>
            {version.max_lead_age_seconds ? `${version.max_lead_age_seconds / 60}m` : "—"}
          </strong>
          <small>{version.requirements_json?.consent_required ? "CONSENT REQUIRED" : "NO CONSENT GATE"}</small>
        </article>
        <article>
          <header><span>RETURN WINDOW</span><i>↩</i></header>
          <strong>{returnWindow != null ? `${returnWindow}h` : "—"}</strong>
          <small>{reasons?.length ? `${reasons.length} REASONS` : "NO RETURNS"}</small>
        </article>
      </div>

      <article className="dashPanel">
        <header>
          <span>TERMS</span>
          <h2>Delivery and eligibility</h2>
        </header>
        <div className="termsGrid">
          <div><dt>Geography</dt><dd>{geoSummary(version)}</dd></div>
          <div>
            <dt>Verification</dt>
            <dd>{String(version.requirements_json?.verification ?? "None specified")}</dd>
          </div>
          <div>
            <dt>Minimum quality</dt>
            <dd>{String(version.requirements_json?.min_quality_score ?? "—")}</dd>
          </div>
          <div>
            <dt>Accepted return reasons</dt>
            <dd>{reasons?.length ? reasons.join(", ") : "—"}</dd>
          </div>
          <div>
            <dt>Offer version published</dt>
            <dd>{version.published_at?.slice(0, 10) ?? "—"}</dd>
          </div>
          <div>
            <dt>Governing schema version</dt>
            <dd>
              v{schemaVersion?.version ?? "—"} · frozen{" "}
              {schemaVersion?.published_at?.slice(0, 10) ?? "—"}
            </dd>
          </div>
        </div>
      </article>

      <article className="dashPanel">
        <header>
          <span>FIELDS</span>
          <h2>{fields.length} fields in the payload contract</h2>
        </header>
        <div className="tableHead specRow">
          <span>KEY</span>
          <span>LABEL</span>
          <span>TYPE</span>
          <span>REQ</span>
          <span>PHASE</span>
          <span>PII</span>
          <span>ALLOWED VALUES</span>
          <span>VALIDATION</span>
        </div>
        {fields.map((f) => (
          <div className="tableRow specRow" key={f.field_key}>
            <span><code>{f.field_key}</code></span>
            <span>
              {f.label}
              {f.description && <small className="specHint">{f.description}</small>}
            </span>
            <span className="status">{f.field_type}</span>
            <span>{f.required ? "REQUIRED" : "optional"}</span>
            <span className="status">{f.phase}</span>
            <span>
              {f.is_pii ? "PII" : "—"}
              {f.consent_classification !== "none" && (
                <small className="specHint">{f.consent_classification}</small>
              )}
            </span>
            <span>{(f.enum_values ?? []).join(", ") || "—"}</span>
            <span>
              {Object.keys(f.validation_json ?? {}).length
                ? JSON.stringify(f.validation_json)
                : "—"}
            </span>
          </div>
        ))}
        {!fields.length && (
          <div className="tableRow">
            <span className="status">This schema version defines no fields.</span>
          </div>
        )}
      </article>

      <div className="dashGrid">
        <article className="dashPanel">
          <header>
            <span>EXAMPLE PING</span>
            <h2>Request payload</h2>
          </header>
          <pre className="codeBlock">{JSON.stringify(pingExample, null, 2)}</pre>
        </article>
        <article className="dashPanel">
          <header>
            <span>EXAMPLE POST</span>
            <h2>Request payload</h2>
          </header>
          <pre className="codeBlock">{JSON.stringify(postExample, null, 2)}</pre>
        </article>
      </div>

      <article className="dashPanel">
        <header>
          <span>INTEGRATION</span>
          <h2>Generated artifacts</h2>
        </header>
        <p className="chartCaption">
          These are generated from schema v{schemaVersion?.version ?? "—"}, the same
          definitions the router validates against, so the contract cannot drift from
          what is enforced.
        </p>
        <div className="downloadRow">
          <a className="rangeExport" href={`${specBase}?format=json_schema&phase=ping`}>
            PING JSON SCHEMA ↓
          </a>
          <a className="rangeExport" href={`${specBase}?format=json_schema&phase=post`}>
            POST JSON SCHEMA ↓
          </a>
          <a className="rangeExport" href={`${specBase}?format=csv`}>
            FIELD DICTIONARY CSV ↓
          </a>
          <a className="rangeExport" href={specBase}>
            FULL SPECIFICATION JSON ↓
          </a>
        </div>
        <pre className="codeBlock">{JSON.stringify(pingSchema, null, 2)}</pre>
      </article>
    </WorkspaceShell>
  );
}
