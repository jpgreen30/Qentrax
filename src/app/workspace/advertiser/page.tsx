import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createCampaign } from "./actions";

export default async function AdvertiserWorkspace({
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

  if (!org || org.type !== "advertiser") redirect("/workspace");

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, status, base_bid_cents, daily_budget_cents, created_at")
    .eq("advertiser_org_id", orgId)
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
        <p className="eyebrow">ADVERTISER · {org.onboarding_status}</p>
        <h1>{org.legal_name}</h1>
        <p className="lede">
          Draft campaigns are available before funding. Activation requires
          approval, endpoint health, and available balance (Phase 2).
        </p>

        <form action={createCampaign}>
          <input type="hidden" name="organization_id" value={orgId} />
          <label>
            Campaign name
            <input name="name" required placeholder="CA solar — exclusive" />
          </label>
          <label>
            Base bid (cents)
            <input name="base_bid_cents" type="number" min={0} defaultValue={2500} />
          </label>
          <label>
            Daily budget (cents)
            <input name="daily_budget_cents" type="number" min={0} defaultValue={50000} />
          </label>
          <button className="button" type="submit">
            Create draft campaign
          </button>
        </form>

        <div className="tenant-list">
          {(campaigns ?? []).map((c) => (
            <div key={c.id} className="tenant-card">
              <span>
                <strong>{c.name}</strong>
                <small>
                  {c.status} · bid ${(c.base_bid_cents / 100).toFixed(2)}
                  {c.daily_budget_cents != null
                    ? ` · daily $${(c.daily_budget_cents / 100).toFixed(0)}`
                    : ""}
                </small>
              </span>
            </div>
          ))}
          {!campaigns?.length && (
            <p className="notice">No campaigns yet. Create a draft above.</p>
          )}
        </div>
      </section>
    </main>
  );
}
