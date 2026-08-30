import Link from "next/link";
import WorkspaceShell from "@/components/WorkspaceShell";
import { initials, money, requireOrg } from "@/lib/workspace-data";
import { listPublisherDemand } from "@/lib/publisher/demand";

function ageLabel(seconds: number | null) {
  if (seconds == null) return "No limit";
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds}s`;
}

export default async function PublisherDemand({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; vertical?: string; state?: string }>;
}) {
  const params = await searchParams;
  const { supabase, org } = await requireOrg(params.org, "publisher");

  const demand = await listPublisherDemand(supabase, {
    verticalId: params.vertical ?? null,
    state: params.state ?? null,
  });

  const { data: verticals } = await supabase
    .from("verticals")
    .select("id, name")
    .eq("active", true)
    .order("name");

  const base = `/workspace/publisher/demand?org=${org.id}`;

  return (
    <WorkspaceShell
      role="publisher"
      orgId={org.id}
      orgName={org.legal_name}
      orgStatus={org.onboarding_status}
      initials={initials(org.legal_name)}
      active="demand"
      eyebrow="SUPPLY"
      title="Available demand"
      subtitle="Live offers you can send traffic to, with the exact intake contract and your rate."
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
          {demand.length} offer{demand.length === 1 ? "" : "s"} with active demand
        </span>
      </div>

      {demand.length === 0 ? (
        <article className="dashPanel">
          <div className="emptyState">
            <p>No offers are buying in this view right now.</p>
            <small>
              Demand appears here only when a published offer has at least one active
              campaign, so nothing listed is a dead end.
            </small>
          </div>
        </article>
      ) : (
        demand.map((d) => (
          <article className="dashPanel" key={d.offer_id}>
            <header>
              <span>{d.vertical_name ?? "—"}</span>
              <h2>{d.offer_name}</h2>
            </header>

            <div className="dashStats demandStats">
              <article>
                <header><span>YOUR RATE</span><i>$</i></header>
                <strong>
                  {d.publisher_rate_cents != null ? money(d.publisher_rate_cents) : "—"}
                </strong>
                <small>
                  {d.publisher_rate_cents == null
                    ? d.pricing_mode.toUpperCase()
                    : d.rate_is_indicative
                      ? "MINIMUM · VARIES BY AUCTION"
                      : "PER ACCEPTED LEAD"}
                </small>
              </article>
              <article>
                <header><span>LEAD TYPE</span><i>◇</i></header>
                <strong>{d.lead_type}</strong>
                <small>{d.active_campaigns} ACTIVE CAMPAIGN{d.active_campaigns === 1 ? "" : "S"}</small>
              </article>
              <article>
                <header><span>GEOGRAPHY</span><i>◎</i></header>
                <strong>{d.states?.length ? d.states.join(", ") : "Nationwide"}</strong>
                <small>
                  {d.excluded_states?.length ? `EXCLUDING ${d.excluded_states.join(", ")}` : "NO EXCLUSIONS"}
                </small>
              </article>
              <article>
                <header><span>MAX LEAD AGE</span><i>⌁</i></header>
                <strong>{ageLabel(d.max_lead_age_seconds)}</strong>
                <small>{d.consent_required ? "CONSENT REQUIRED" : "NO CONSENT GATE"}</small>
              </article>
            </div>

            <div className="termsGrid">
              <div>
                <dt>Verification</dt>
                <dd>{d.verification ?? "None specified"}</dd>
              </div>
              <div>
                <dt>Minimum quality score</dt>
                <dd>{d.min_quality_score ?? "—"}</dd>
              </div>
              <div>
                <dt>Return window</dt>
                <dd>{d.return_window_hours != null ? `${d.return_window_hours}h` : "—"}</dd>
              </div>
              <div>
                <dt>Governing versions</dt>
                <dd>offer v{d.offer_version} · schema v{d.schema_version ?? "—"}</dd>
              </div>
            </div>

            <div className="dashGrid">
              <div className="demandFields">
                <h3>PING FIELDS</h3>
                {d.ping_fields.map((f) => (
                  <div className="demandField" key={f.field_key}>
                    <code>{f.field_key}</code>
                    <span>{f.type}</span>
                    <span>{f.required ? "REQUIRED" : "optional"}</span>
                    <span>{f.allowed_values?.join(", ") ?? ""}</span>
                  </div>
                ))}
                {!d.ping_fields.length && <p className="hint">No ping fields defined.</p>}
              </div>
              <div className="demandFields">
                <h3>POST FIELDS</h3>
                {d.post_fields.map((f) => (
                  <div className="demandField" key={f.field_key}>
                    <code>{f.field_key}</code>
                    <span>{f.type}</span>
                    <span>{f.required ? "REQUIRED" : "optional"}</span>
                    <span>
                      {f.is_pii ? "PII " : ""}
                      {f.consent_classification !== "none" ? f.consent_classification : ""}
                    </span>
                  </div>
                ))}
                {!d.post_fields.length && <p className="hint">No post fields defined.</p>}
              </div>
            </div>

            <div className="downloadRow">
              <Link
                className="rangeExport"
                href={`/workspace/publisher/demand/${d.offer_slug}?org=${org.id}`}
              >
                INTEGRATION GUIDE →
              </Link>
            </div>
          </article>
        ))
      )}
    </WorkspaceShell>
  );
}
