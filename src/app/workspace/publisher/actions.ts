"use server";

import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";

export async function createSource(formData: FormData) {
  const auth = await requireAuthContext();
  if (!auth) redirect("/sign-in");

  const organizationId = String(formData.get("organization_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const channel = String(formData.get("channel") ?? "web").trim();
  const domain = String(formData.get("domain") ?? "").trim();

  if (!organizationId || !name) redirect(`/workspace/publisher?org=${organizationId}`);

  const supabase = await createClient();
  await supabase.from("publisher_sources").insert({
    publisher_org_id: organizationId,
    name,
    channel: channel || "web",
    domain: domain || null,
    status: "draft",
  });

  redirect(`/workspace/publisher?org=${organizationId}`);
}
