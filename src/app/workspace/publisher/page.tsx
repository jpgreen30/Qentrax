import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createSource } from "./actions";

export default async function PublisherWorkspace({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org: orgId } = await searchParams;
  if (!orgId) redirect("/workspace");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/sign-in");

  const { data: org } = await supabase
    .from("organizations")
    .select("id, legal_name, onboarding_status, type")
    .eq("id", orgId)
    .maybeSingle();

  if (!org || org.type !== "publisher") redirect("/workspace");

  const { data: sources } = await supabase
    .from("publisher_sources")
    .select("id, name, channel, domain, status, created_at")
    .eq("publisher_org_id", orgId)
    .order("created_at", { ascending: false });

  return (
    <main>
      <nav>
        <Link className="brand" href="/">
          QENTRAX
        </Link>
        <Link href="/workspace">Workspaces</Link>
      </nav>
      <section className="workspace">
        <p className="eyebrow">PUBLISHER · {org.onboarding_status}</p>
        <h1>{org.legal_name}</h1>
        <p className="lede">
          Register sources with consent provenance. Live traffic requires source
          approval; test submissions never create advertiser charges.
        </p>

        <form action={createSource}>
          <input type="hidden" name="organization_id" value={orgId} />
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
          <button className="button" type="submit">
            Create draft source
          </button>
        </form>

        <div className="tenant-list">
          {(sources ?? []).map((s) => (
            <div key={s.id} className="tenant-card">
              <span>
                <strong>{s.name}</strong>
                <small>
                  {s.status} · {s.channel}
                  {s.domain ? ` · ${s.domain}` : ""}
                </small>
              </span>
              <em className="mono">{s.id.slice(0, 8)}</em>
            </div>
          ))}
          {!sources?.length && (
            <p className="notice">No sources yet. Create a draft above.</p>
          )}
        </div>
      </section>
    </main>
  );
}
