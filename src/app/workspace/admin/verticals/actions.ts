"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuthContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { parseFieldInput } from "@/lib/offers/field-input";

async function requireAdmin() {
  const auth = await requireAuthContext();
  if (!auth) redirect("/sign-in");
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/workspace");
  return { auth, supabase };
}

const BASE = "/workspace/admin/verticals";

/** Errors ride back on the query string; the page renders them inline. */
function back(verticalId: string | null, errors?: string[]): never {
  const q = new URLSearchParams();
  if (verticalId) q.set("vertical", verticalId);
  if (errors?.length) q.set("error", errors.join(" "));
  redirect(`${BASE}${q.size ? `?${q}` : ""}`);
}

export async function createVertical(formData: FormData) {
  const { supabase } = await requireAdmin();
  const code = String(formData.get("code") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!code || !name) back(null, ["Code and name are required."]);
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(code)) {
    back(null, ["Code must be lowercase letters, digits and underscores."]);
  }

  const { data, error } = await supabase
    .from("verticals")
    .insert({ code, name, description, active: true })
    .select("id")
    .maybeSingle();

  if (error) back(null, [error.message]);
  revalidatePath(BASE);
  back(data?.id ?? null);
}

export async function updateVertical(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("vertical_id") ?? "");
  if (!id) back(null, ["Vertical is required."]);

  const { error } = await supabase
    .from("verticals")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim() || null,
      active: String(formData.get("active") ?? "") === "on",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) back(id, [error.message]);
  revalidatePath(BASE);
  back(id);
}

/**
 * Opens the next draft, seeded from the newest published version. The database
 * function enforces one open draft per vertical and assigns the version number.
 */
export async function createSchemaDraft(formData: FormData) {
  const { auth, supabase } = await requireAdmin();
  const verticalId = String(formData.get("vertical_id") ?? "");
  if (!verticalId) back(null, ["Vertical is required."]);

  const { error } = await supabase.rpc("create_vertical_schema_draft", {
    p_vertical_id: verticalId,
    p_created_by: auth.userId ?? null,
    p_notes: String(formData.get("notes") ?? "").trim() || null,
  });

  if (error) back(verticalId, [error.message]);
  revalidatePath(BASE);
  back(verticalId);
}

export async function addField(formData: FormData) {
  const { supabase } = await requireAdmin();
  const verticalId = String(formData.get("vertical_id") ?? "");
  const versionId = String(formData.get("schema_version_id") ?? "");
  if (!versionId) back(verticalId, ["Schema version is required."]);

  const parsed = parseFieldInput(formData);
  if (!parsed.ok) back(verticalId, parsed.errors);

  const { error } = await supabase
    .from("vertical_fields")
    .insert({ schema_version_id: versionId, ...parsed.value });

  // A published version rejects the insert at the trigger; surface that rather
  // than a raw database error.
  if (error) {
    back(verticalId, [
      error.message.includes("not draft")
        ? "That schema version is published. Open a new draft to change fields."
        : error.message,
    ]);
  }

  revalidatePath(BASE);
  back(verticalId);
}

export async function deleteField(formData: FormData) {
  const { supabase } = await requireAdmin();
  const verticalId = String(formData.get("vertical_id") ?? "");
  const fieldId = String(formData.get("field_id") ?? "");
  if (!fieldId) back(verticalId, ["Field is required."]);

  const { error } = await supabase.from("vertical_fields").delete().eq("id", fieldId);
  if (error) back(verticalId, [error.message]);
  revalidatePath(BASE);
  back(verticalId);
}

export async function reorderField(formData: FormData) {
  const { supabase } = await requireAdmin();
  const verticalId = String(formData.get("vertical_id") ?? "");
  const fieldId = String(formData.get("field_id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const current = Number(formData.get("sort_order") ?? 0);

  const next = direction === "up" ? current - 1 : current + 1;
  const { error } = await supabase
    .from("vertical_fields")
    .update({ sort_order: next, updated_at: new Date().toISOString() })
    .eq("id", fieldId);

  if (error) back(verticalId, [error.message]);
  revalidatePath(BASE);
  back(verticalId);
}

export async function publishSchemaVersion(formData: FormData) {
  const { supabase } = await requireAdmin();
  const verticalId = String(formData.get("vertical_id") ?? "");
  const versionId = String(formData.get("schema_version_id") ?? "");
  if (!versionId) back(verticalId, ["Schema version is required."]);

  const { error } = await supabase.rpc("publish_vertical_schema_version", {
    p_version_id: versionId,
  });

  if (error) back(verticalId, [error.message]);
  revalidatePath(BASE);
  back(verticalId);
}
