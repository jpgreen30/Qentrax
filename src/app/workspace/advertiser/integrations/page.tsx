import Link from "next/link";
import WorkspaceShell from "@/components/WorkspaceShell";
import { initials, requireOrg } from "@/lib/workspace-data";
import { saveIntegration, setIntegrationStatus, sendTestLead } from "./actions";

type Connector = {
  id: string;
  name: string;
  connector_type: string;
  status: string;
  endpoint_url: string | null;
  method: string | null;
  auth_type: string | null;
  timeout_ms: number | null;
  ping_field_mapping: Record<string, string> | null;
  post_field_mapping: Record<string, string> | null;
  updated_at: string | null;
};

type Attempt = {
  id: string;
  response_status_code: number | null;
  latency_ms: number | null;
  success: boolean | null;
  error_message: string | null;
  created_at: string;
};

const MAPPING_ROWS = 6;

function mappingEntries(mapping: Record<string, string> | null) {
  return Object.entries(mapping ?? {});
}

export default async function AdvertiserIntegrations({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; integration?: string; error?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const { supabase, org } = await requireOrg(params.org, "advertiser");

  const { data: rows } = await supabase
    .from("connectors")
    .select(
      `id, name, connector_type, status, endpoint_url, method, auth_type, timeout_ms,
       ping_field_mapping, post_field_mapping, updated_at`,
    )
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  const connectors = (rows ?? []) as Connector[];
  const selected =
    connectors.find((c) => c.id === params.integration) ?? connectors[0] ?? null;

  let attempts: Attempt[] = [];
  if (selected) {
    const { data } = await supabase
      .from("connector_delivery_attempts")
      .select("id, response_status_code, latency_ms, success, error_message, created_at")
      .eq("connector_id", selected.id)
      .order("created_at", { ascending: false })
      .limit(25);
    attempts = (data ?? []) as Attempt[];
  }

  // Health is derived from the recorded attempts, not a stored score.
  const recent = attempts.slice(0, 10);
  const successes = recent.filter((a) => a.success).length;
  const lastSuccess = attempts.find((a) => a.success);
  const lastFailure = attempts.find((a) => a.success === false);
  const successRate = recent.length ? Math.round((successes / recent.length) * 100) : null;

  const existingPing = mappingEntries(selected?.ping_field_mapping ?? null);
  const existingPost = mappingEntries(selected?.post_field_mapping ?? null);

  return (
    <WorkspaceShell
      role="advertiser"
      orgId={org.id}
      orgName={org.legal_name}
      orgStatus={org.onboarding_status}
      initials={initials(org.legal_name)}
      active="integrations"
      eyebrow="DELIVERY"
      title="Integrations"
      subtitle="Where purchased leads are sent, how fields map, and how each destination is behaving."
    >
      {params.error && <div className="formError">{params.error}</div>}
      {params.notice && <div className="formNotice">{params.notice}</div>}

      <div className="dashGrid">
        <article className="dashPanel">
          <header>
            <span>DESTINATIONS</span>
            <h2>{connectors.length} configured</h2>
          </header>
          {connectors.map((c) => (
            <Link
              key={c.id}
              href={`/workspace/advertiser/integrations?org=${org.id}&integration=${c.id}`}
              className={c.id === selected?.id ? "tableRow vertRow active" : "tableRow vertRow"}
            >
              <span>{c.name}</span>
              <span className="status">{c.connector_type}</span>
              <span className="status">{c.status.toUpperCase()}</span>
            </Link>
          ))}
          {!connectors.length && (
            <div className="tableRow">
              <span className="status">No integrations yet.</span>
            </div>
          )}
          <div className="stackForm">
            <Link className="rangeExport" href={`/workspace/advertiser/integrations?org=${org.id}&integration=new`}>
              ＋ NEW INTEGRATION
            </Link>
          </div>
        </article>

        <article className="dashPanel">
          <header>
            <span>HEALTH</span>
            <h2>{selected ? selected.name : "No integration selected"}</h2>
          </header>
          {selected ? (
            <div className="termsGrid">
              <div>
                <dt>Status</dt>
                <dd>{selected.status.toUpperCase()}</dd>
              </div>
              <div>
                <dt>Recent success rate</dt>
                <dd>
                  {successRate == null ? "No attempts yet" : `${successRate}% of last ${recent.length}`}
                </dd>
              </div>
              <div>
                <dt>Last success</dt>
                <dd>{lastSuccess ? lastSuccess.created_at.slice(0, 19).replace("T", " ") : "—"}</dd>
              </div>
              <div>
                <dt>Last error</dt>
                <dd>
                  {lastFailure
                    ? `${lastFailure.response_status_code ?? "no response"} · ${lastFailure.error_message ?? "failed"}`
                    : "—"}
                </dd>
              </div>
            </div>
          ) : (
            <div className="emptyState">
              <p>Create an integration to start delivering purchased leads.</p>
            </div>
          )}

          {selected && (
            <div className="stackForm">
              <form action={sendTestLead}>
                <input type="hidden" name="org_id" value={org.id} />
                <input type="hidden" name="integration_id" value={selected.id} />
                <button type="submit">SEND TEST LEAD</button>
              </form>
              <form action={setIntegrationStatus}>
                <input type="hidden" name="org_id" value={org.id} />
                <input type="hidden" name="integration_id" value={selected.id} />
                <label>
                  Status
                  <select name="status" defaultValue={selected.status}>
                    <option value="testing">testing</option>
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </label>
                <button type="submit">UPDATE STATUS</button>
              </form>
            </div>
          )}
        </article>
      </div>

      <article className="dashPanel">
        <header>
          <span>{params.integration === "new" || !selected ? "NEW INTEGRATION" : "CONFIGURATION"}</span>
          <h2>Destination and field mapping</h2>
        </header>
        <form action={saveIntegration} className="stackForm fieldBuilder">
          <input type="hidden" name="org_id" value={org.id} />
          {selected && params.integration !== "new" && (
            <input type="hidden" name="integration_id" value={selected.id} />
          )}
          <div className="formGrid">
            <label>
              Name
              <input
                name="name"
                required
                defaultValue={params.integration === "new" ? "" : (selected?.name ?? "")}
                placeholder="Salesforce lead endpoint"
              />
            </label>
            <label>
              Type
              <select
                name="connector_type"
                defaultValue={params.integration === "new" ? "webhook" : (selected?.connector_type ?? "webhook")}
              >
                <option value="webhook">webhook</option>
                <option value="zapier">zapier</option>
                <option value="make">make</option>
                <option value="hubspot">hubspot</option>
                <option value="rest">rest</option>
              </select>
            </label>
            <label className="wide">
              Endpoint URL
              <input
                name="endpoint_url"
                required
                defaultValue={params.integration === "new" ? "" : (selected?.endpoint_url ?? "")}
                placeholder="https://hooks.example.com/qentrax"
              />
            </label>
            <label>
              Method
              <select
                name="method"
                defaultValue={params.integration === "new" ? "POST" : (selected?.method ?? "POST")}
              >
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
              </select>
            </label>
            <label>
              Auth
              <select
                name="auth_type"
                defaultValue={params.integration === "new" ? "none" : (selected?.auth_type ?? "none")}
              >
                <option value="none">none</option>
                <option value="bearer">bearer</option>
                <option value="api_key">api_key</option>
                <option value="basic">basic</option>
              </select>
            </label>
            <label>
              Timeout (ms)
              <input
                name="timeout_ms"
                type="number"
                min="1000"
                max="30000"
                defaultValue={params.integration === "new" ? 10000 : (selected?.timeout_ms ?? 10000)}
              />
            </label>
          </div>

          <p className="hint">
            Credentials are stored by reference and never rendered here. Destinations are
            validated against the same rules the delivery worker applies, so an
            unreachable or unsafe URL is rejected now rather than failing on every lead.
          </p>

          <h3>Post field mapping</h3>
          <p className="hint">Qentrax field on the left, destination field on the right.</p>
          {Array.from({ length: MAPPING_ROWS }).map((_, i) => (
            <div className="daypartRow mappingRow" key={`post-${i}`}>
              <input
                name="post_source"
                placeholder="email"
                defaultValue={params.integration === "new" ? "" : (existingPost[i]?.[0] ?? "")}
                aria-label={`Post mapping ${i + 1} Qentrax field`}
              />
              <input
                name="post_target"
                placeholder="Email"
                defaultValue={params.integration === "new" ? "" : (existingPost[i]?.[1] ?? "")}
                aria-label={`Post mapping ${i + 1} destination field`}
              />
            </div>
          ))}

          <h3>Ping field mapping</h3>
          {Array.from({ length: 3 }).map((_, i) => (
            <div className="daypartRow mappingRow" key={`ping-${i}`}>
              <input
                name="ping_source"
                placeholder="zip"
                defaultValue={params.integration === "new" ? "" : (existingPing[i]?.[0] ?? "")}
                aria-label={`Ping mapping ${i + 1} Qentrax field`}
              />
              <input
                name="ping_target"
                placeholder="PostalCode"
                defaultValue={params.integration === "new" ? "" : (existingPing[i]?.[1] ?? "")}
                aria-label={`Ping mapping ${i + 1} destination field`}
              />
            </div>
          ))}

          <button type="submit">
            {params.integration === "new" || !selected ? "CREATE INTEGRATION" : "SAVE INTEGRATION"}
          </button>
        </form>
      </article>

      {selected && (
        <article className="dashPanel">
          <header>
            <span>DELIVERY HISTORY</span>
            <h2>Recent attempts</h2>
          </header>
          <div className="tableHead report">
            <span>WHEN</span>
            <span>RESULT</span>
            <span>LATENCY</span>
            <span>DETAIL</span>
          </div>
          {attempts.map((a) => (
            <div className="tableRow report" key={a.id}>
              <span>{a.created_at.slice(0, 19).replace("T", " ")}</span>
              <span className="status">
                {a.success ? "OK" : "FAILED"} {a.response_status_code ?? ""}
              </span>
              <span>{a.latency_ms != null ? `${a.latency_ms}ms` : "—"}</span>
              <span>{a.error_message ?? "—"}</span>
            </div>
          ))}
          {!attempts.length && (
            <div className="tableRow">
              <span className="status">No delivery attempts recorded yet.</span>
            </div>
          )}
        </article>
      )}
    </WorkspaceShell>
  );
}
