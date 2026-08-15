import WorkspaceShell from "@/components/WorkspaceShell";
import { initials, requireOrg } from "@/lib/workspace-data";
import Link from "next/link";

export default async function PublisherTeam({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org: orgId } = await searchParams;
  const { supabase, org } = await requireOrg(orgId, "publisher");

  const { data: members } = await supabase
    .from("organization_members")
    .select(
      "id, status, joined_at, created_at, user:users(id, email, display_name), role:roles(name, code)",
    )
    .eq("organization_id", org.id)
    .order("created_at", { ascending: true });

  return (
    <WorkspaceShell
      role="publisher"
      orgId={org.id}
      orgName={org.legal_name}
      orgStatus={org.onboarding_status}
      initials={initials(org.legal_name)}
      active="team"
      eyebrow="ORGANIZATION"
      title="Team"
      subtitle="People with access to this publisher workspace."
    >
      <div className="dashStats">
        <article>
          <header>
            <span>MEMBERS</span>
            <i>◎</i>
          </header>
          <strong>{(members ?? []).length}</strong>
          <small>ACTIVE ACCESS</small>
        </article>
        <article>
          <header>
            <span>ORG STATUS</span>
            <i>◇</i>
          </header>
          <strong style={{ fontSize: 18 }}>{org.onboarding_status}</strong>
          <small>ONBOARDING</small>
        </article>
        <article>
          <header>
            <span>TYPE</span>
            <i>⌂</i>
          </header>
          <strong style={{ fontSize: 18 }}>PUBLISHER</strong>
          <small>PORTAL</small>
        </article>
        <article>
          <header>
            <span>SUPPORT</span>
            <i>↗</i>
          </header>
          <strong style={{ fontSize: 16 }}>
            <a href="mailto:network@qentrax.io" style={{ color: "var(--acid)" }}>
              network@qentrax.io
            </a>
          </strong>
          <small>INVITES & ROLES</small>
        </article>
      </div>

      <div className="dashPanel">
        <header>
          <span>ROSTER</span>
          <h2>Workspace members</h2>
        </header>
        <div className="tableHead team">
          <span>MEMBER</span>
          <span>ROLE</span>
          <span>STATUS</span>
          <span>JOINED</span>
        </div>
        {(members ?? []).map((m) => {
          const user = m.user as unknown as {
            id: string;
            email: string;
            display_name: string | null;
          } | null;
          const role = m.role as unknown as { name: string; code: string } | null;
          const name = user?.display_name || user?.email || "—";
          return (
            <div className="tableRow team" key={m.id}>
              <span>
                <strong style={{ display: "block", fontSize: 13 }}>{name}</strong>
                <small style={{ color: "#718287" }}>{user?.email}</small>
              </span>
              <span className="status">{role?.name ?? role?.code ?? "—"}</span>
              <span>{(m.status ?? "active").toUpperCase()}</span>
              <span>
                {m.joined_at
                  ? new Date(m.joined_at).toLocaleDateString()
                  : m.created_at
                    ? new Date(m.created_at).toLocaleDateString()
                    : "—"}
              </span>
            </div>
          );
        })}
        {!members?.length && (
          <div className="tableRow">
            <span className="status">No members found for this organization.</span>
          </div>
        )}
      </div>

      <article className="dashPanel metricsNote">
        <span>TEAM ACCESS</span>
        <p>
          Membership is managed through organization onboarding and admin approval. Invite links
          and role assignment UI ship with KYB / agreement acceptance. Until then, contact the
          network team to add operators.
        </p>
        <p style={{ marginTop: 12 }}>
          <Link href={`/workspace/publisher?org=${org.id}`} className="dashGhost">
            ← Back to overview
          </Link>
        </p>
      </article>
    </WorkspaceShell>
  );
}
