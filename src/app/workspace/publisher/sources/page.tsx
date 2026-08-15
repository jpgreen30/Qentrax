import Link from "next/link";
import WorkspaceShell from "@/components/WorkspaceShell";
import { initials, requireOrg } from "@/lib/workspace-data";
import { createSource } from "../actions";

export default async function PublisherSources({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org: orgId } = await searchParams;
  const { supabase, org } = await requireOrg(orgId, "publisher");

  const { data: sources } = await supabase
    .from("publisher_sources")
    .select("id, name, channel, domain, status, created_at")
    .eq("publisher_org_id", org.id)
    .order("created_at", { ascending: false });

  return (
    <WorkspaceShell
      role="publisher"
      orgId={org.id}
      orgName={org.legal_name}
      orgStatus={org.onboarding_status}
      initials={initials(org.legal_name)}
      active="sources"
      eyebrow="SUPPLY COMMAND"
      title="Sources"
      subtitle="Traffic sources that feed the marketplace."
      primaryAction={
        <Link className="dashAction" href="#create">
          ＋ ADD SOURCE
        </Link>
      }
    >
      <div className="dashPanel">
        <div className="tableHead sources">
          <span>NAME</span>
          <span>CHANNEL</span>
          <span>DOMAIN</span>
          <span>STATUS</span>
          <span>CREATED</span>
        </div>
        {(sources ?? []).map((s) => (
          <div className="tableRow sources" key={s.id}>
            <span>{s.name}</span>
            <span>{s.channel}</span>
            <span>{s.domain ?? "—"}</span>
            <span className="status">{s.status.toUpperCase()}</span>
            <span>{new Date(s.created_at).toLocaleDateString()}</span>
          </div>
        ))}
        {!sources?.length && (
          <div className="tableRow">
            <span className="status">No sources yet — add one below.</span>
          </div>
        )}
      </div>

      <article className="dashPanel formPanel" id="create">
        <header>
          <span>NEW SOURCE</span>
          <h2>Register a traffic source</h2>
        </header>
        <form action={createSource} className="workspace-actions">
          <input type="hidden" name="organization_id" value={org.id} />
          <label>
            Source name
            <input name="name" required placeholder="Homepage solar form" />
          </label>
          <label>
            Channel
            <input name="channel" defaultValue="web" />
          </label>
          <label>
            Domain
            <input name="domain" placeholder="example.com" />
          </label>
          <button className="dashAction" type="submit">
            Create draft source
          </button>
        </form>
      </article>
    </WorkspaceShell>
  );
}
