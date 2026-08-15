import Link from "next/link";
import { redirect } from "next/navigation";
import WorkspaceShell from "@/components/WorkspaceShell";
import { createClient } from "@/lib/supabase/server";
import { approveOrganization, rejectOrganization } from "./actions";

export default async function AdminWorkspace() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/sign-in");

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) {
    return (
      <main className="dash admin">
        <section className="dashMain">
          <h1>Admin</h1>
          <p className="dashNotice">Platform admin role required.</p>
          <Link href="/workspace">Back</Link>
        </section>
      </main>
    );
  }

  const { data: queue } = await supabase
    .from("organizations")
    .select("id, legal_name, type, onboarding_status, status, created_at, website")
    .in("onboarding_status", ["profile_submitted", "under_review", "needs_information"])
    .neq("type", "platform")
    .order("created_at", { ascending: true });

  const { data: recent } = await supabase
    .from("organizations")
    .select("id, legal_name, type, onboarding_status, status")
    .neq("type", "platform")
    .order("updated_at", { ascending: false })
    .limit(20);

  const { data: txnCount } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true });

  return (
    <WorkspaceShell
      role="admin"
      orgName="Qentrax Platform"
      orgStatus="admin"
      initials="QX"
      active="overview"
      eyebrow="PLATFORM OPERATIONS"
      title="Approval queue"
      subtitle="Approve advertisers and publishers before live demand."
    >
      <div className="dashStats">
        <article>
          <header>
            <span>PENDING</span>
            <i>◎</i>
          </header>
          <strong>{(queue ?? []).length}</strong>
          <small>AWAITING REVIEW</small>
        </article>
        <article>
          <header>
            <span>ORGS</span>
            <i>⌂</i>
          </header>
          <strong>{(recent ?? []).length}</strong>
          <small>RECENT</small>
        </article>
        <article>
          <header>
            <span>TRANSACTIONS</span>
            <i>$</i>
          </header>
          <strong>{txnCount ?? "—"}</strong>
          <small>NETWORK</small>
        </article>
        <article>
          <header>
            <span>STATUS</span>
            <i>⌁</i>
          </header>
          <strong>LIVE</strong>
          <small>TEST MODE</small>
        </article>
      </div>

      <div className="dashPanel">
        <header>
          <span>PENDING REVIEW</span>
          <h2>Organizations awaiting approval</h2>
        </header>
        {(queue ?? []).map((org) => (
          <div className="adminRow" key={org.id}>
            <div>
              <strong>{org.legal_name}</strong>
              <small>
                {org.type} · {org.onboarding_status}
                {org.website ? ` · ${org.website}` : ""}
              </small>
            </div>
            <div className="adminActions">
              <form action={approveOrganization}>
                <input type="hidden" name="organization_id" value={org.id} />
                <button className="dashAction" type="submit">
                  Approve
                </button>
              </form>
              <form action={rejectOrganization}>
                <input type="hidden" name="organization_id" value={org.id} />
                <button className="dashGhost" type="submit">
                  Reject
                </button>
              </form>
            </div>
          </div>
        ))}
        {!queue?.length && <p className="dashNotice">No organizations awaiting review.</p>}
      </div>

      <div className="dashPanel">
        <header>
          <span>RECENT</span>
          <h2>Latest organizations</h2>
        </header>
        <div className="tableHead sources">
          <span>NAME</span>
          <span>TYPE</span>
          <span>ONBOARDING</span>
          <span>STATUS</span>
          <span>—</span>
        </div>
        {(recent ?? []).map((org) => (
          <div className="tableRow sources" key={org.id}>
            <span>{org.legal_name}</span>
            <span>{org.type}</span>
            <span className="status">{org.onboarding_status}</span>
            <span>{org.status}</span>
            <span>—</span>
          </div>
        ))}
      </div>
    </WorkspaceShell>
  );
}
