import Link from "next/link";
import WorkspaceShell from "@/components/WorkspaceShell";
import { requireAdmin } from "@/lib/workspace-data";

export default async function AdminOrganizations() {
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

  return (
    <WorkspaceShell
      role="admin"
      orgName="Qentrax Platform"
      orgStatus="admin"
      initials="QX"
      active="organizations"
      eyebrow="PLATFORM OPERATIONS"
      title="Organizations"
      subtitle="Directory of advertisers and publishers on the exchange."
      primaryAction={
        <Link className="dashAction" href="/workspace/admin">
          APPROVAL QUEUE
        </Link>
      }
    >
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
            {pending} PENDING · {rejected} REJECTED
          </small>
        </article>
      </div>

      <div className="dashPanel">
        <header>
          <span>DIRECTORY</span>
          <h2>All organizations</h2>
        </header>
        <div className="tableHead orgs">
          <span>NAME</span>
          <span>TYPE</span>
          <span>ONBOARDING</span>
          <span>STATUS</span>
          <span>CREATED</span>
        </div>
        {(orgs ?? []).map((org) => (
          <div className="tableRow orgs" key={org.id}>
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
            <span>{org.status}</span>
            <span>{new Date(org.created_at).toLocaleDateString()}</span>
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
          Approval and rejection run from the Approvals queue. KYB provider adapters and agreement
          versioning ship with counsel-approved documents. Suspend / reinstate controls will attach
          to this directory with mandatory audit reasons.
        </p>
      </article>
    </WorkspaceShell>
  );
}
