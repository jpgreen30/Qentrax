import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { approveOrganization, rejectOrganization } from "./actions";

export default async function AdminWorkspace() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/sign-in");

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) {
    return (
      <main>
        <section className="workspace narrow">
          <h1>Admin</h1>
          <p className="notice">Platform admin role required.</p>
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

  return (
    <main>
      <nav>
        <Link className="brand" href="/">
          QENTRAX
        </Link>
        <Link href="/workspace">Workspaces</Link>
        <span className="pill">Admin</span>
      </nav>
      <section className="workspace">
        <p className="eyebrow">PLATFORM OPERATIONS</p>
        <h1>Approval queue</h1>
        <p className="lede">
          Approve advertiser and publisher organizations before campaign activation
          or live source traffic.
        </p>

        <h2>Pending</h2>
        <div className="tenant-list">
          {(queue ?? []).map((org) => (
            <div key={org.id} className="tenant-card">
              <span>
                <strong>{org.legal_name}</strong>
                <small>
                  {org.type} · {org.onboarding_status}
                  {org.website ? ` · ${org.website}` : ""}
                </small>
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <form action={approveOrganization}>
                  <input type="hidden" name="organization_id" value={org.id} />
                  <button className="button" type="submit">
                    Approve
                  </button>
                </form>
                <form action={rejectOrganization}>
                  <input type="hidden" name="organization_id" value={org.id} />
                  <button className="button" type="submit">
                    Reject
                  </button>
                </form>
              </div>
            </div>
          ))}
          {!queue?.length && <p className="notice">No organizations awaiting review.</p>}
        </div>

        <h2>Recent</h2>
        <div className="tenant-list">
          {(recent ?? []).map((org) => (
            <div key={org.id} className="tenant-card">
              <span>
                <strong>{org.legal_name}</strong>
                <small>
                  {org.type} · {org.onboarding_status} · {org.status}
                </small>
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
