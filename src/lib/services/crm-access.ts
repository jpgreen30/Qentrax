import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuthContext, type AuthContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";

type OrganizationRow = {
  id: string;
  legal_name: string;
  onboarding_status: string;
  type: string;
  status: string;
};

type QueryClient = Pick<SupabaseClient, "from">;

export type CrmAccessResult =
  | {
      ok: true;
      auth: AuthContext;
      supabase: QueryClient;
      organization: OrganizationRow;
    }
  | {
      ok: false;
      code: "AUTH_REQUIRED" | "VALIDATION_ERROR" | "AUTH_FORBIDDEN";
      message: string;
    };

/**
 * Resolve an authenticated advertiser organization for CRM routes.
 *
 * CRM writes that land in `crm_integrations` / `crm_sync_records` still need a
 * trusted server-side client for the actual insert/update work, but the caller
 * must be a signed-in member of the advertiser org before we use that elevated
 * client.
 */
export async function requireAdvertiserCrmAccess(
  organizationId: string | null,
  deps?: {
    auth?: AuthContext | null;
    supabase?: QueryClient;
  },
): Promise<CrmAccessResult> {
  const hasAuthOverride = deps !== undefined && Object.prototype.hasOwnProperty.call(deps, "auth");
  const auth = hasAuthOverride ? deps?.auth ?? null : await requireAuthContext();
  if (!auth) {
    return {
      ok: false,
      code: "AUTH_REQUIRED",
      message: "Authentication is required.",
    };
  }

  if (!organizationId) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "organization_id is required.",
    };
  }

  const hasSupabaseOverride =
    deps !== undefined && Object.prototype.hasOwnProperty.call(deps, "supabase");
  const supabase = hasSupabaseOverride ? (deps?.supabase as QueryClient) : await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, legal_name, onboarding_status, type, status")
    .eq("id", organizationId)
    .eq("type", "advertiser")
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      code: "AUTH_FORBIDDEN",
      message: "No advertiser organization accessible.",
    };
  }

  return {
    ok: true,
    auth,
    supabase,
    organization: data as OrganizationRow,
  };
}
