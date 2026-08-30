import Link from "next/link";
import { notFound } from "next/navigation";
import WorkspaceShell from "@/components/WorkspaceShell";
import { initials, money, requireOrg } from "@/lib/workspace-data";
import { listPublisherDemand } from "@/lib/publisher/demand";
import { buildJsonSchema } from "@/lib/offers/json-schema";
import { buildExamplePayload } from "@/lib/offers/examples";
import type { VerticalField } from "@/lib/offers/types";
import { REASON_CODES } from "@/lib/reason-codes";

/**
 * Publisher intake documentation for one offer.
 *
 * Every contract shown is derived from the schema version the offer froze at
 * publish, so this page cannot drift from what the router validates. The error
 * codes are the platform's canonical list, not a hand-maintained copy.
 */
const PUBLISHER_ERROR_CODES = [
  "SCHEMA_MISSING_FIELD",
  "SCHEMA_INVALID",
  "CONSENT_MISSING",
  "CONSENT_INVALID",
  "GEO_MISMATCH",
  "ELIGIBILITY_MISMATCH",
  "DUPLICATE_CONSUMER",
  "VELOCITY_EXCEEDED",
  "CAMPAIGN_INACTIVE",
  "CAMPAIGN_CAP_REACHED",
  "AUTH_REQUIRED",
] as const;

export default async function PublisherIntakeGuide({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ org?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const { supabase, org } = await requireOrg(query.org, "publisher");

  const demand = await listPublisherDemand(supabase);
  const offer = demand.find((d) => d.offer_slug === slug);
  if (!offer) notFound();

  const { data: offerRow } = await supabase
    .from("offers")
    .select(
      `id, slug,
       offer_versions!offers_current_version_id_fkey ( schema_version_id )`,
    )
    .eq("slug", slug)
    .maybeSingle();

  const schemaVersionId = (
    offerRow?.offer_versions as unknown as { schema_version_id: string } | null
  )?.schema_version_id;

  const { data: fieldRows } = await supabase
    .from("vertical_fields")
    .select(
      `field_key, label, description, field_type, required, phase, is_pii,
       consent_classification, enum_values, validation_json, default_value,
       aliases, sort_order`,
    )
    .eq("schema_version_id", schemaVersionId ?? "")
    .order("sort_order");

  const fields = (fieldRows ?? []) as unknown as VerticalField[];
  const meta = {
    offerSlug: offer.offer_slug,
    offerVersion: offer.offer_version,
    schemaVersion: offer.schema_version ?? 0,
  };

  const pingExample = buildExamplePayload(fields, "ping");
  const postExample = buildExamplePayload(fields, "post");

  return (
    <WorkspaceShell
      role="publisher"
      orgId={org.id}
      orgName={org.legal_name}
      orgStatus={org.onboarding_status}
      initials={initials(org.legal_name)}
      active="demand"
      eyebrow="INTEGRATION GUIDE"
      title={offer.offer_name}
      subtitle="Endpoint, authentication, contracts and error codes for this offer."
    >
      <div className="reportControls">
        <Link className="rangeTab" href={`/workspace/publisher/demand?org=${org.id}`}>
          ← ALL DEMAND
        </Link>
        <span className="rangeMeta">
          offer v{offer.offer_version} · schema v{offer.schema_version ?? "—"}
        </span>
        <span className="rangeExport">
          {offer.publisher_rate_cents != null
            ? `${money(offer.publisher_rate_cents)}${offer.rate_is_indicative ? " MIN" : ""}`
            : offer.pricing_mode.toUpperCase()}
        </span>
      </div>

      <article className="dashPanel">
        <header>
          <span>ENDPOINTS</span>
          <h2>Where to send</h2>
        </header>
        <div className="termsGrid">
          <div>
            <dt>Ping</dt>
            <dd><code>POST /api/v1/ping</code></dd>
          </div>
          <div>
            <dt>Post</dt>
            <dd><code>POST /api/v1/post</code></dd>
          </div>
          <div>
            <dt>Authentication</dt>
            <dd>Bearer token on the <code>Authorization</code> header</dd>
          </div>
          <div>
            <dt>Content type</dt>
            <dd><code>application/json</code></dd>
          </div>
          <div>
            <dt>Idempotency</dt>
            <dd>
              Reuse the same <code>external_submission_id</code> to retry safely; a repeat
              never creates a second transaction or a second charge.
            </dd>
          </div>
          <div>
            <dt>Vertical</dt>
            <dd><code>{offer.vertical_code ?? "—"}</code></dd>
          </div>
        </div>
      </article>

      <div className="dashGrid">
        <article className="dashPanel">
          <header>
            <span>PING REQUEST</span>
            <h2>Minimum fields to get a bid</h2>
          </header>
          <pre className="codeBlock">{JSON.stringify(pingExample, null, 2)}</pre>
        </article>
        <article className="dashPanel">
          <header>
            <span>POST REQUEST</span>
            <h2>Full payload on acceptance</h2>
          </header>
          <pre className="codeBlock">{JSON.stringify(postExample, null, 2)}</pre>
        </article>
      </div>

      <article className="dashPanel">
        <header>
          <span>FIELD CONTRACT</span>
          <h2>{fields.length} fields, derived from schema v{offer.schema_version ?? "—"}</h2>
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
            <span>{f.label}</span>
            <span className="status">{f.field_type}</span>
            <span>{f.required ? "REQUIRED" : "optional"}</span>
            <span className="status">{f.phase}</span>
            <span>{f.is_pii ? "PII" : "—"}</span>
            <span>{(f.enum_values ?? []).join(", ") || "—"}</span>
            <span>
              {Object.keys(f.validation_json ?? {}).length
                ? JSON.stringify(f.validation_json)
                : "—"}
            </span>
          </div>
        ))}
      </article>

      <article className="dashPanel">
        <header>
          <span>ERROR CODES</span>
          <h2>Stable rejection reasons</h2>
        </header>
        <p className="chartCaption">
          These codes are stable contract. Wording may change; a code is never
          repurposed to mean something else.
        </p>
        <div className="tableHead report">
          <span>CODE</span>
          <span>MEANING</span>
        </div>
        {PUBLISHER_ERROR_CODES.map((code) => (
          <div className="tableRow errorRow" key={code}>
            <span><code>{code}</code></span>
            <span>{REASON_CODES[code]}</span>
          </div>
        ))}
      </article>

      <article className="dashPanel">
        <header>
          <span>ACCEPTANCE</span>
          <h2>What this offer requires</h2>
        </header>
        <div className="termsGrid">
          <div><dt>Consent evidence</dt><dd>{offer.consent_required ? "Required" : "Not required"}</dd></div>
          <div><dt>Verification</dt><dd>{offer.verification ?? "None specified"}</dd></div>
          <div><dt>Minimum quality score</dt><dd>{offer.min_quality_score ?? "—"}</dd></div>
          <div>
            <dt>Maximum lead age</dt>
            <dd>
              {offer.max_lead_age_seconds != null
                ? `${offer.max_lead_age_seconds / 60} min`
                : "No limit"}
            </dd>
          </div>
          <div>
            <dt>Geography</dt>
            <dd>{offer.states?.length ? offer.states.join(", ") : "Nationwide"}</dd>
          </div>
          <div>
            <dt>Return window</dt>
            <dd>{offer.return_window_hours != null ? `${offer.return_window_hours}h` : "—"}</dd>
          </div>
        </div>
      </article>

      <details className="dashPanel schemaDetails">
        <summary>Generated JSON Schema (ping)</summary>
        <pre className="codeBlock">
          {JSON.stringify(buildJsonSchema(fields, "ping", meta), null, 2)}
        </pre>
      </details>
    </WorkspaceShell>
  );
}
