import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationSeverity = "info" | "warning" | "critical";

export async function emitNotification(
  supabase: SupabaseClient,
  input: {
    organizationId?: string | null;
    userId?: string | null;
    type: string;
    severity?: NotificationSeverity;
    title: string;
    body?: string;
    href?: string | null;
    dedupeKey?: string | null;
    payload?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.rpc("emit_notification", {
    p_organization_id: input.organizationId ?? null,
    p_user_id: input.userId ?? null,
    p_type: input.type,
    p_severity: input.severity ?? "info",
    p_title: input.title,
    p_body: input.body ?? "",
    p_href: input.href ?? null,
    p_dedupe_key: input.dedupeKey ?? null,
    p_payload: input.payload ?? {},
  });
  if (error) {
    console.error("emit_notification", error.message);
  }
}
