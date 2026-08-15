import Link from "next/link";
import WorkspaceShell from "@/components/WorkspaceShell";
import { requireAdmin } from "@/lib/workspace-data";
import { reinstateOrganization, suspendOrganization } from "../actions";

export default async function AdminOrganizations({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { supabase } = await requireAdmin();

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, legal_name, type, status, onboarding_status, website, created_at, updated_at")
    .neq("type", "platform")
    .order("created_at", { ascending: false })
    .limit(300);

  const advertisers = (orgs ?? []).filter((o) => o.type === "advertiser");
  const publishers = (orgs ?? []).filter((o) => o.type === "publisher");
  const approved = (orgs ?? []).filter((o) => o.onboarding_status === "approved").length;
  const pending = (orgs ?? []).filter((o) =>
    ["profile_submitted", "under_review", "needs_information"].includes(o.onboarding_status),
  ).length;
  const rejected = (orgs ?? []).filter((o) => o.onboarding_status === "rejected").length;
  const suspended = (orgs ?? []).filter((o) => o.status === "suspended").length;

  const notice =
    params.error
      ? params.error
      : params.ok === "suspended"
        ? "Organization suspended."
        : params.ok === "reinstated"
          ? "Organization reinstated to active."
          : null;

  return (
    <WorkspaceShell
      role="admin"
      orgName="Qentrax Platform"
      orgStatus="admin"
      initials="QX"
      active="organizations"
      eyebrow="PLATFORM OPERATIONS"
      title="Organizations"
      subtitle="Directory of advertisers and publishers. Suspend requires a reason."
      primaryAction={
        <Link className="dashAction" href="/workspace/admin">
          APPROVAL QUEUE
        </Link>
      }
    >
      {notice && (
        <p
          className="dashNotice"
          style={params.error ? { borderColor: "#5a2a2a", color: "#ff8a8a" } : undefined}
        >
          {notice}
        </p>
      )}

      <div className="dashStats">
        <article>
          <header>
            <span>TOTAL</span>
            <i>⌂</i>
          </header>
          <strong>{(orgs ?? []).length}</strong>
          <small>NON-PLATFORM ORGS</small>
        </article>
        <article>
          <header>
            <span>ADVERTISERS</span>
            <i>◎</i>
          </header>
          <strong>{advertisers.length}</strong>
          <small>BUY SIDE</small>
        </article>
        <article>
          <header>
            <span>PUBLISHERS</span>
            <i>◇</i>
          </header>
          <strong>{publishers.length}</strong>
          <small>SUPPLY SIDE</small>
        </article>
        <article>
          <header>
            <span>APPROVED</span>
            <i>✓</i>
          </header>
          <strong>{approved}</strong>
          <small>
            {pending} PENDING · {suspended} SUSPENDED · {rejected} REJECTED
          </small>
        </article>
      </div>

      <div className="dashPanel">
        <header>
          <span>DIRECTORY</span>
          <h2>All organizations</h2>
        </header>
        <div className="tableHead orgsCtrl">
          <span>NAME</span>
          <span>TYPE</span>
          <span>ONBOARDING</span>
          <span>STATUS</span>
          <span>CONTROLS</span>
        </div>
        {(orgs ?? []).map((org) => (
          <div className="tableRow orgsCtrl" key={org.id}>
            <span>
              <strong style={{ fontWeight: 600 }}>{org.legal_name}</strong>
              {org.website ? (
                <small style={{ display: "block", color: "#718287", fontSize: 11 }}>
                  {org.website}
                </small>
              ) : null}
            </span>
            <span>{org.type}</span>
            <span className="status">{org.onboarding_status}</span>
            <span
              className={org.status === "suspended" ? "status" : undefined}
              style={org.status === "suspended" ? { color: "#ff8a8a" } : undefined}
            >
              {org.status}
            </span>
            <span>
              {org.status === "active" ? (
                <form action={suspendOrganization} className="orgControlForm">
                  <input type="hidden" name="organization_id" value={org.id} />
                  <input
                    name="reason"
                    required
                    minLength={3}
                    placeholder="Reason (required)"
                    className="orgReason"
                  />
                  <button className="dashGhost" type="submit" style={{ height: 32, fontSize: 10 }}>
                    Suspend
                  </button>
                </form>
              ) : org.status === "suspended" ? (
                <form action={reinstateOrganization} className="orgControlForm">
                  <input type="hidden" name="organization_id" value={org.id} />
                  <input
                    name="reason"
                    placeholder="Reason (optional)"
                    className="orgReason"
                  />
                  <button className="dashAction" type="submit" style={{ height: 32, fontSize: 10 }}>
                    Reinstate
                  </button>
                </form>
              ) : (
                <span style={{ color: "#6a7c80" }}>—</span>
              )}
            </span>
          </div>
        ))}
        {!orgs?.length && (
          <div className="tableRow">
            <span className="status">No organizations registered yet.</span>
          </div>
        )}
      </div>

      <article className="dashPanel metricsNote">
        <span>DIRECTORY NOTES</span>
        <p>
          Suspend sets status=suspended and writes an audit event with the reason. Reinstate returns
          status to active. Campaign activation and intake should respect org status in later
          hardening. Approval/rejection remains on the{" "}
          <Link href="/workspace/admin" style={{ color: "var(--acid)" }}>
            Approvals queue
          </Link>
          .
        </p>
      </article>
    </WorkspaceShell>
  );
}
