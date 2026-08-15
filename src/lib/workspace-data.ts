import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function requireOrg(orgId: string | undefined, expectedType: "advertiser" | "publisher") {
  if (!orgId) redirect("/workspace");
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/sign-in");

  const { data: org, error } = await supabase
    .from("organizations")
    .select("id, legal_name, onboarding_status, type, status")
    .eq("id", orgId)
    .maybeSingle();

  if (error || !org || org.type !== expectedType) redirect("/workspace");
  return { supabase, org };
}

/** Platform admin gate — redirects non-admins away from /workspace/admin/* */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/sign-in");

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/workspace");

  return { supabase, claims: claims.claims };
}

export function money(cents: number | null | undefined) {
  return `$${((cents ?? 0) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "QX"
  );
}
