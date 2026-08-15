import WorkspaceShell from "@/components/WorkspaceShell";
import { requireAdmin } from "@/lib/workspace-data";

export default async function AdminAudit() {
  const { supabase } = await requireAdmin();

  const { data: events } = await supabase
    .from("audit_events")
    .select(
      "id, action, resource_type, resource_id, reason, actor_user_id, actor_org_id, request_id, before_redacted, after_redacted, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(150);

  const { data: users } = await supabase
    .from("users")
    .select("id, email, display_name")
    .limit(200);

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, legal_name")
    .limit(300);

  const userLabel = new Map(
    (users ?? []).map((u) => [u.id, u.display_name || u.email || u.id.slice(0, 8)]),
  );
  const orgLabel = new Map((orgs ?? []).map((o) => [o.id, o.legal_name]));

  const byAction = new Map<string, number>();
  for (const e of events ?? []) {
    byAction.set(e.action, (byAction.get(e.action) ?? 0) + 1);
  }

  return (
    <WorkspaceShell
      role="admin"
      orgName="Qentrax Platform"
      orgStatus="admin"
      initials="QX"
      active="audit"
      eyebrow="PLATFORM COMPLIANCE"
      title="Audit log"
      subtitle="Append-only administrative and financial event stream."
    >
      <div className="dashStats">
        <article>
          <header>
            <span>EVENTS</span>
            <i>▦</i>
          </header>
          <strong>{(events ?? []).length}</strong>
          <small>RECENT WINDOW</small>
        </article>
        <article>
          <header>
            <span>ACTIONS</span>
            <i>◎</i>
          </header>
          <strong>{byAction.size}</strong>
          <small>DISTINCT TYPES</small>
        </article>
        <article>
          <header>
            <span>IMMUTABLE</span>
            <i>✓</i>
          </header>
          <strong>ON</strong>
          <small>UPDATE/DELETE BLOCKED</small>
        </article>
        <article>
          <header>
            <span>RETENTION</span>
            <i>⌁</i>
          </header>
          <strong>LIVE</strong>
          <small>FULL HISTORY</small>
        </article>
      </div>

      {byAction.size > 0 && (
        <div className="dashPanel">
          <header>
            <span>MIX</span>
            <h2>Action distribution</h2>
          </header>
          <div className="funnel" style={{ paddingTop: 12 }}>
            {Array.from(byAction.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([action, n]) => {
                const max = Math.max(...Array.from(byAction.values()), 1);
                return (
                  <div className="funnelStep" key={action}>
                    <span title={action} style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {action.replace(/^organization\./, "org.").replace(/^payout_batch\./, "payout.")}
                    </span>
                    <div className="funnelBar" style={{ width: `${(n / max) * 100}%` }} />
                    <b>{n}</b>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className="dashPanel">
        <header>
          <span>STREAM</span>
          <h2>Recent audit events</h2>
        </header>
        <div className="tableHead audit">
          <span>WHEN</span>
          <span>ACTION</span>
          <span>RESOURCE</span>
          <span>ACTOR</span>
          <span>REASON</span>
        </div>
        {(events ?? []).map((e) => (
          <div className="tableRow audit" key={e.id}>
            <span>{new Date(e.created_at).toLocaleString()}</span>
            <span className="status">{e.action}</span>
            <span>
              {e.resource_type}
              {e.resource_id ? ` · ${String(e.resource_id).slice(0, 8)}` : ""}
              {e.actor_org_id && orgLabel.get(e.actor_org_id)
                ? ` · ${orgLabel.get(e.actor_org_id)}`
                : ""}
            </span>
            <span>{e.actor_user_id ? userLabel.get(e.actor_user_id) ?? e.actor_user_id.slice(0, 8) : "—"}</span>
            <span>{e.reason ?? "—"}</span>
          </div>
        ))}
        {!events?.length && (
          <div className="tableRow">
            <span className="status">
              No audit events visible. Approve/reject an org or create a payout batch to emit events.
            </span>
          </div>
        )}
      </div>

      <article className="dashPanel metricsNote">
        <span>AUDIT NOTES</span>
        <p>
          Events are append-only (DB trigger blocks update/delete). Sensitive admin actions require a
          reason string. Finance approve/release and org suspend/reinstate write before/after
          snapshots when available.
        </p>
      </article>
    </WorkspaceShell>
  );
}
