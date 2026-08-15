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
    <main>
      <nav>
        <Link className="brand" href="/">
          QENTRAX
        </Link>
        <span className="pill">Authenticated</span>
        {isAdmin ? <Link href="/workspace/admin">Admin</Link> : null}
      </nav>
      <section className="workspace">
        <p className="eyebrow">ORGANIZATION CONTEXT</p>
        <h1>Choose your workspace</h1>
        <p className="lede">
          Signed in as {String(data.claims.email ?? "")}. Demo path: create org →
          admin approve → fund advertiser → activate campaign → publisher test lead.
        </p>
        {params.org && (
          <p className="notice" role="status">
            Organization created. Ask a platform admin to approve it, then fund and
            activate campaigns.
          </p>
        )}
        <div className="tenant-list">
          {memberships?.map((m) => {
            const org = m.organization as unknown as {
              legal_name: string;
              type: string;
              status: string;
              onboarding_status: string;
            };
            const role = m.role as unknown as { name: string; code: string };
            const href =
              org?.type === "advertiser"
                ? `/workspace/advertiser?org=${m.organization_id}`
                : org?.type === "publisher"
                  ? `/workspace/publisher?org=${m.organization_id}`
                  : org?.type === "platform"
                    ? `/workspace/admin`
                    : `/workspace`;
            return (
              <Link key={m.organization_id} href={href} className="tenant-card">
                <span>
                  <strong>{org?.legal_name}</strong>
                  <small>
                    {role?.name} · {org?.type} · {org?.onboarding_status}
                  </small>
                </span>
                <em>{org?.status}</em>
              </Link>
            );
          })}
        </div>
        {!memberships?.length && (
          <p className="notice">
            Your identity is verified.{" "}
            <Link href="/onboarding">Create an advertiser or publisher organization</Link>
            .
          </p>
        )}
        {!!memberships?.length && (
          <p className="lede">
            <Link href="/onboarding">Register another organization</Link>
          </p>
        )}
      </section>
    </main>
  );
}
