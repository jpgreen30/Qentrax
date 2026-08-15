import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensures a public.users row exists for the authenticated auth subject.
 * Primary path is the auth.users trigger; this is a safety net for edge cases.
 */
export async function ensureUser(
  supabase: SupabaseClient,
  claims: { sub?: string; email?: string; user_metadata?: { display_name?: string } },
): Promise<{ id: string } | null> {
  const authSubject = claims.sub;
  if (!authSubject) return null;

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("auth_subject", authSubject)
    .maybeSingle();

  if (existing?.id) return { id: existing.id };

  const email = claims.email ?? `${authSubject}@unknown.local`;
  const displayName =
    claims.user_metadata?.display_name ?? email.split("@")[0] ?? "User";

  const { data: inserted, error } = await supabase
    .from("users")
    .insert({
      auth_subject: authSubject,
      email,
      display_name: displayName,
      status: "active",
      last_login_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    // Race: trigger or concurrent request may have inserted
    const { data: raced } = await supabase
      .from("users")
      .select("id")
      .eq("auth_subject", authSubject)
      .maybeSingle();
    return raced?.id ? { id: raced.id } : null;
  }

  return inserted ? { id: inserted.id } : null;
}
