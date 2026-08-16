import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Catalog / marketplace reads (demand, requirements, preflight).
 * Uses service role only when QENTRAX_MCP_USE_SERVICE_ROLE=1 AND token is valid
 * (caller must authenticate first). Prefer user-scoped clients when OAuth exists.
 *
 * Performance queries still enforce org binding in application code.
 */
export function createMcpSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    "";

  if (!url) {
    throw new Error("SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL is required for MCP");
  }

  // Prototype: service role for catalog reads after token auth.
  // Documented gap: replace with user JWT after OAuth linking.
  const key =
    process.env.QENTRAX_MCP_USE_SERVICE_ROLE === "1" && serviceKey
      ? serviceKey
      : anonKey || serviceKey;

  if (!key) {
    throw new Error("Supabase key missing for MCP client");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
