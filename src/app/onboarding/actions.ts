"use server";

import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";

export async function createOrganization(formData: FormData) {
  const auth = await requireAuthContext();
  if (!auth) redirect("/sign-in");

  const type = String(formData.get("type") ?? "");
  const legalName = String(formData.get("legal_name") ?? "").trim();
  const dbaName = String(formData.get("dba_name") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const taxCountry = String(formData.get("tax_country") ?? "US").trim().slice(0, 2);

  if (!legalName || (type !== "advertiser" && type !== "publisher")) {
    redirect("/onboarding?error=invalid");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_organization", {
    p_type: type,
    p_legal_name: legalName,
    p_dba_name: dbaName || null,
    p_website: website || null,
    p_tax_country: taxCountry || "US",
  });

  if (error || !data) {
    redirect(`/onboarding?error=create`);
  }

  const orgId =
    typeof data === "object" && data !== null && "id" in data
      ? String((data as { id: string }).id)
      : null;

  if (!orgId) redirect("/onboarding?error=create");
  redirect(`/workspace?org=${orgId}`);
}
