import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Identity boundary: verified OAuth / Supabase Auth subject → public.users.id.
 *
 * organization_members.user_id references public.users.id, NEVER auth.users.id.
 * Auth UID must come exclusively from the verified OAuth principal (JWT sub);
 * never from tool/model arguments.
 */

export type ResolveAppUserOk = {
  ok: true;
  /** public.users.id — safe for organization_members.user_id */
  appUserId: string;
  /** auth.users.id / JWT sub — never use as organization_members.user_id */
  authSubject: string;
};

export type ResolveAppUserErr = {
  ok: false;
  code: "USER_NOT_FOUND" | "USER_INACTIVE";
  message: string;
};

export type ResolveAppUserResult = ResolveAppUserOk | ResolveAppUserErr;

export type MembershipOrgRow = {
  organization_id: string;
  status: string;
  organizations: { type?: string } | { type?: string }[] | null;
};

/**
 * Map verified Auth subject → active application user id.
 * Lookup only — does not create users or organizations.
 */
export async function resolveAppUserFromAuthSubject(
  supabase: SupabaseClient,
  authSubject: string,
): Promise<ResolveAppUserResult> {
  const subject = (authSubject ?? "").trim();
  if (!subject) {
    return {
      ok: false,
      code: "USER_NOT_FOUND",
      message: "Missing authenticated subject.",
    };
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

  return {
    ok: true,
    appUserId: data.id,
    authSubject: subject,
  };
}

/**
 * List active organization_members for a verified Auth subject.
 * Always resolves Auth UID → public.users.id first; never queries memberships
 * with auth.users.id.
 */
export async function listActiveMembershipsForAuthSubject(
  supabase: SupabaseClient,
  authSubject: string,
): Promise<
  | { ok: true; appUserId: string; memberships: MembershipOrgRow[] }
  | ResolveAppUserErr
> {
  const resolved = await resolveAppUserFromAuthSubject(supabase, authSubject);
  if (!resolved.ok) return resolved;

  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, status, organizations(type)")
    .eq("user_id", resolved.appUserId)
    .eq("status", "active");

  if (error) {
    return {
      ok: false,
      code: "USER_NOT_FOUND",
      message: "Failed to load organization memberships.",
    };
  }

  return {
    ok: true,
    appUserId: resolved.appUserId,
    memberships: (data ?? []) as MembershipOrgRow[],
  };
}

/** Guard: never treat OAuth sub as organization_members.user_id. */
export function assertNotAuthSubjectAsMemberUserId(
  authSubject: string,
  appUserId: string,
): boolean {
  return Boolean(authSubject && appUserId && authSubject !== appUserId);
}
