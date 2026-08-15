import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createSource, submitTestOpportunity } from "./actions";

export default async function PublisherWorkspace({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; opp?: string; txn?: string; opp_error?: string }>;
}) {
  const params = await searchParams;
  const orgId = params.org;
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

  const { data: txns } = await supabase
    .from("transactions")
    .select("id, status, advertiser_price_cents, publisher_amount_cents, created_at, opportunity_id")
    .eq("publisher_org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(10);

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
          Submit a test opportunity to run the minimal auction against active,
          funded advertiser campaigns.
        </p>

        {params.opp && (
          <p className="notice" role="status">
            Auction result: <strong>{params.opp}</strong>
            {params.txn ? ` · ${params.txn}` : ""}
          </p>
        )}
        {params.opp_error && (
          <p className="notice" role="alert">
            Opportunity or auction failed. Ensure an active funded campaign exists.
          </p>
        )}

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
              <form action={submitTestOpportunity}>
                <input type="hidden" name="organization_id" value={orgId} />
                <input type="hidden" name="source_id" value={s.id} />
                <button className="button" type="submit">
                  Submit test lead
                </button>
              </form>
            </div>
          ))}
          {!sources?.length && (
            <p className="notice">No sources yet. Create a draft above.</p>
          )}
        </div>

        <h2>Recent billable transactions</h2>
        <div className="tenant-list">
          {(txns ?? []).map((t) => (
            <div key={t.id} className="tenant-card">
              <span>
                <strong>{t.status}</strong>
                <small>
                  charge ${(t.advertiser_price_cents / 100).toFixed(2)} · pub $
                  {(t.publisher_amount_cents / 100).toFixed(2)}
                </small>
              </span>
            </div>
          ))}
          {!txns?.length && <p className="notice">No transactions yet.</p>}
        </div>
      </section>
    </main>
  );
}
