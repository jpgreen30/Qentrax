"use server";

import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth-context";
import { isStripeConfigured } from "@/lib/stripe/client";
import { startPublisherConnect } from "@/lib/stripe/connect";
import { createClient } from "@/lib/supabase/server";

export async function createSource(formData: FormData) {
  const auth = await requireAuthContext();
  if (!auth) redirect("/sign-in");

  const organizationId = String(formData.get("organization_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const verticalCode = String(formData.get("vertical_code") ?? "").trim();

  if (!organizationId || !name) {
    redirect(`/workspace/publisher/sources?org=${organizationId}`);
  }

  const supabase = await createClient();

  let verticalId: string | null = null;
  if (verticalCode) {
    const { data: v } = await supabase
      .from("verticals")
      .select("id")
      .eq("code", verticalCode)
      .maybeSingle();
    verticalId = v?.id ?? null;
  }

  await supabase.from("publisher_sources").insert({
    publisher_org_id: organizationId,
    name,
    vertical_id: verticalId,
    status: "active",
  });

  redirect(`/workspace/publisher/sources?org=${organizationId}`);
}

/** Start Stripe Express onboarding for publisher payouts. */
export async function startConnectOnboarding(formData: FormData) {
  const auth = await requireAuthContext();
  if (!auth) redirect("/sign-in");

  const organizationId = String(formData.get("organization_id") ?? "");
  if (!organizationId) redirect("/workspace");

  if (!isStripeConfigured()) {
    redirect(
      `/workspace/publisher/earnings?org=${organizationId}&error=${encodeURIComponent("Stripe keys not configured")}`,
    );
  }

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, legal_name, type, stripe_connect_account_id, stripe_connect_status")
    .eq("id", organizationId)
    .maybeSingle();

  if (!org || org.type !== "publisher") {
    redirect(`/workspace/publisher/earnings?org=${organizationId}&error=${encodeURIComponent("Invalid org")}`);
  }

  // redirect() throws NEXT_REDIRECT — keep it outside try/catch
  let onboardUrl: string;
  try {
    const { url } = await startPublisherConnect({
      supabase,
      org: {
        id: org.id,
        legal_name: org.legal_name,
        stripe_connect_account_id: org.stripe_connect_account_id,
      },
      email: auth.email ?? null,
    });
    onboardUrl = url;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Connect onboarding failed";
    redirect(`/workspace/publisher/earnings?org=${organizationId}&error=${encodeURIComponent(msg)}`);
  }

  redirect(onboardUrl);
}
