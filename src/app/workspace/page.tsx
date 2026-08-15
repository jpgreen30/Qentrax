import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/ensure-user";

export default async function Workspace({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/sign-in");

  const appUser = await ensureUser(supabase, data.claims as {
    sub?: string;
    email?: string;
    user_metadata?: { display_name?: string };
  });

  const params = await searchParams;
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");

  let membershipsQuery = supabase
    .from("organization_members")
    .select(
      "organization_id, role:roles(name, code), organization:organizations(legal_name, type, status, onboarding_status)",
    )
    .eq("status", "active");

  if (appUser?.id) {
    membershipsQuery = membershipsQuery.eq("user_id", appUser.id);
  }

  const { data: memberships } = await membershipsQuery;

  return (
    <main className="wsPick">
      <header className="wsPickHead">
        <Link className="dashBrand" href="/">
          <i>Q</i>
          <span>
            QENTRAX<small>WORKSPACES</small>
          </span>
        </Link>
        <div className="wsPickMeta">
          <span className="pill">{String(data.claims.email ?? "")}</span>
          {isAdmin ? (
            <Link className="dashGhost" href="/workspace/admin">
              Admin queue
            </Link>
          ) : null}
          <Link className="dashGhost" href="/onboarding">
            + New org
          </Link>
        </div>
      </header>

      <section className="wsPickBody">
        <p className="eyebrow">ORGANIZATION CONTEXT</p>
        <h1>Choose your workspace</h1>
        <p className="lede">
          Open an advertiser or publisher portal. Each org has its own campaigns, sources, ledger,
          and reports.
        </p>
        {params.org && (
          <p className="dashNotice" role="status">
            Organization created. Open it below, or approve it in Admin if needed.
          </p>
        )}

        <div className="wsPickGrid">
          {memberships?.map((m) => {
            const org = m.organization as unknown as {
              legal_name: string;
              type: string;
              status: string;
              onboarding_status: string;
            };
            const role = m.role as unknown as { name: string };
            const href =
              org?.type === "advertiser"
                ? `/workspace/advertiser?org=${m.organization_id}`
                : org?.type === "publisher"
                  ? `/workspace/publisher?org=${m.organization_id}`
                  : org?.type === "platform"
                    ? `/workspace/admin`
                    : `/workspace`;
            return (
              <Link key={m.organization_id} href={href} className="wsPickCard">
                <span className="wsPickType">{org?.type}</span>
                <strong>{org?.legal_name}</strong>
                <small>
                  {role?.name} · {org?.onboarding_status}
                </small>
                <em>Open portal →</em>
              </Link>
            );
          })}
        </div>

        {!memberships?.length && (
          <p className="dashNotice">
            No organizations yet.{" "}
            <Link href="/onboarding">Create an advertiser or publisher organization</Link>.
          </p>
        )}

        <p className="wsPickFoot">
          Design previews:{" "}
          <Link href="/advertiser/dashboard-preview">Advertiser</Link>
          {" · "}
          <Link href="/publisher/dashboard-preview">Publisher</Link>
        </p>
      </section>
    </main>
  );
}
