/**
 * Resolve Qentrax organization access from authenticated identity.
 *
 * Identity boundary:
 *   verified OAuth sub (Auth UID)
 *   → public.users.auth_subject
 *   → public.users.id
 *   → organization_members.user_id
 *
 * Never treat Auth UID as organization_members.user_id.
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

/**
 * Map verified Auth subject → active public.users.id.
 * Lookup only — does not create users.
 */
export async function resolveAppUserIdFromAuthSubject(
  supabase: SupabaseClient,
  authSubject: string,
): Promise<
  | { ok: true; appUserId: string }
  | { ok: false; code: "USER_NOT_FOUND" | "USER_INACTIVE"; message: string }
> {
  const subject = (authSubject ?? "").trim();
  if (!subject) {
    return { ok: false, code: "USER_NOT_FOUND", message: "Missing authenticated subject." };
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, status")
    .eq("auth_subject", subject)
    .maybeSingle();

  if (error || !data?.id) {
    return {
      ok: false,
      code: "USER_NOT_FOUND",
      message: "No application user for this authenticated identity.",
    };
  }
  if (data.status !== "active") {
    return {
      ok: false,
      code: "USER_INACTIVE",
      message: "Application user is not active.",
    };
  }
  return { ok: true, appUserId: data.id };
}

/**
 * List active memberships for a verified OAuth Auth subject.
 * Always maps Auth UID → public.users.id before querying organization_members.
 */
export async function listActiveMemberships(
  supabase: SupabaseClient,
  authSubject: string,
): Promise<Membership[]> {
  const resolved = await resolveAppUserIdFromAuthSubject(supabase, authSubject);
  if (!resolved.ok) return [];

  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, status, organizations(type, legal_name), roles(code)")
    .eq("user_id", resolved.appUserId)
    .eq("status", "active");

  if (error || !data) return [];

  return data.map((row) => {
    const org = row.organizations as { type?: string; legal_name?: string } | null;
    const roleRow = row.roles as { code?: string } | null;
    return {
      organization_id: row.organization_id as string,
      role: String(roleRow?.code ?? ""),
      status: String(row.status ?? ""),
      org_type: org?.type ?? null,
      legal_name: org?.legal_name ?? null,
    };
  });
}

/**
 * Resolve org for performance queries.
 * - If organizationId provided: must be an active membership (else reject).
 * - If omitted: use sole membership if exactly one; prefer type=publisher;
 *   if still ambiguous, return error (do not silently pick).
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
      m.org_type === "advertiser" || m.role.includes("advertiser")
        ? "advertiser"
        : "publisher";
    return { ok: true, organization_id: m.organization_id, role };
  }

  if (memberships.length === 1) {
    const m = memberships[0]!;
    const role =
      m.org_type === "advertiser" || m.role.includes("advertiser")
        ? "advertiser"
        : "publisher";
    return { ok: true, organization_id: m.organization_id, role };
  }

  const preferred = memberships.filter(
    (m) => m.org_type === preferredRole || m.role.includes(preferredRole),
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
