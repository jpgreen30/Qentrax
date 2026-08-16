/**
 * Resolve Qentrax organization access from authenticated Supabase user.
 * Never trust model-supplied org IDs without membership check.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type Membership = {
  organization_id: string;
  role: string;
  status: string;
  org_type?: string | null;
  legal_name?: string | null;
};

export async function listActiveMemberships(
  supabase: SupabaseClient,
  userId: string,
): Promise<Membership[]> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, status, organizations(type, legal_name)")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error || !data) return [];

  return data.map((row) => {
    const org = row.organizations as { type?: string; legal_name?: string } | null;
    return {
      organization_id: row.organization_id as string,
      role: String(row.role ?? ""),
      status: String(row.status ?? ""),
      org_type: org?.type ?? null,
      legal_name: org?.legal_name ?? null,
    };
  });
}

/**
 * Resolve org for performance queries.
 * - If organizationId provided: must be an active membership (else reject).
 * - If omitted: use sole membership if exactly one; if multiple publisher-like
 *   memberships, prefer type=publisher; if still ambiguous, return error.
 */
export function resolveOrganizationAccess(
  memberships: Membership[],
  requestedOrgId: string | null | undefined,
  preferredRole: "publisher" | "advertiser" = "publisher",
):
  | { ok: true; organization_id: string; role: "publisher" | "advertiser" }
  | { ok: false; code: string; message: string } {
  if (memberships.length === 0) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Authenticated user has no active organization memberships.",
    };
  }

  if (requestedOrgId) {
    const m = memberships.find((x) => x.organization_id === requestedOrgId);
    if (!m) {
      return {
        ok: false,
        code: "FORBIDDEN",
        message: "Requested organization is not an active membership for this user.",
      };
    }
    const role =
      m.role === "advertiser" || m.org_type === "advertiser"
        ? "advertiser"
        : "publisher";
    return { ok: true, organization_id: m.organization_id, role };
  }

  if (memberships.length === 1) {
    const m = memberships[0]!;
    const role =
      m.role === "advertiser" || m.org_type === "advertiser"
        ? "advertiser"
        : "publisher";
    return { ok: true, organization_id: m.organization_id, role };
  }

  const preferred = memberships.filter(
    (m) =>
      m.role === preferredRole ||
      m.org_type === preferredRole ||
      (preferredRole === "publisher" && (m.role === "owner" || m.role === "admin")),
  );
  if (preferred.length === 1) {
    const m = preferred[0]!;
    return {
      ok: true,
      organization_id: m.organization_id,
      role: preferredRole,
    };
  }

  return {
    ok: false,
    code: "ORG_AMBIGUOUS",
    message:
      "User belongs to multiple organizations. Pass organization_id from an active membership; do not invent IDs.",
  };
}
