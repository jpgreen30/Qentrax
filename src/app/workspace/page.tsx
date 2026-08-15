import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/ensure-user";

export default async function Workspace() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/sign-in");

  await ensureUser(supabase, data.claims as {
    sub?: string;
    email?: string;
    user_metadata?: { display_name?: string };
  });

  const { data: memberships } = await supabase
    .from("organization_members")
    .select(
      "organization_id, role:roles(name), organization:organizations(legal_name, type, status)",
    );

  return (
    <main>
      <nav>
        <Link className="brand" href="/">
          QENTRAX
        </Link>
        <span className="pill">Authenticated</span>
      </nav>
      <section className="workspace">
        <p className="eyebrow">ORGANIZATION CONTEXT</p>
        <h1>Choose your workspace</h1>
        <p className="lede">
          Signed in as {String(data.claims.email ?? "")}. Every workspace query
          is constrained by organization membership and database RLS.
        </p>
        <div className="tenant-list">
          {memberships?.map((m) => (
            <button key={m.organization_id} type="button">
              <span>
                <strong>
                  {
                    (m.organization as unknown as { legal_name: string })
                      ?.legal_name
                  }
                </strong>
                <small>
                  {(m.role as unknown as { name: string })?.name}
                </small>
              </span>
              <em>
                {(m.organization as unknown as { status: string })?.status}
              </em>
            </button>
          ))}
        </div>
        {!memberships?.length && (
          <p className="notice">
            Your identity is verified. Organization onboarding begins in Phase
            1.
          </p>
        )}
      </section>
    </main>
  );
}
