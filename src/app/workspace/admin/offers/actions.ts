"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuthContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { parseOfferVersionInput, SLUG_PATTERN } from "@/lib/offers/offer-input";

async function requireAdmin() {
  const auth = await requireAuthContext();
  if (!auth) redirect("/sign-in");
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/workspace");
  return { auth, supabase };
}

const BASE = "/workspace/admin/offers";

function back(offerId: string | null, errors?: string[]): never {
  const q = new URLSearchParams();
  if (offerId) q.set("offer", offerId);
  if (errors?.length) q.set("error", errors.join(" "));
  redirect(`${BASE}${q.size ? `?${q}` : ""}`);
}

export async function createOffer(formData: FormData) {
  const { auth, supabase } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const verticalId = String(formData.get("vertical_id") ?? "");
  const description = String(formData.get("description") ?? "").trim() || null;

  const errors: string[] = [];
  if (!name) errors.push("Name is required.");
  if (!verticalId) errors.push("Vertical is required.");
  if (!SLUG_PATTERN.test(slug)) {
    errors.push("Slug must be lowercase letters, digits and hyphens.");
  }
  if (errors.length) back(null, errors);

  const { data, error } = await supabase
    .from("offers")
    .insert({
      name,
      slug,
      description,
      vertical_id: verticalId,
      status: "draft",
      created_by: auth.userId ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    back(null, [
      error.code === "23505" ? `The slug "${slug}" is already taken.` : error.message,
    ]);
  }

  revalidatePath(BASE);
  back(data?.id ?? null);
}

/**
 * Creates the first version of an offer. Later revisions go through
 * create_offer_draft(), which clones the live version rather than starting
 * blank, so a reprice cannot silently drop other terms.
 */
export async function createFirstVersion(formData: FormData) {
  const { supabase } = await requireAdmin();
  const offerId = String(formData.get("offer_id") ?? "");
  if (!offerId) back(null, ["Offer is required."]);

  const parsed = parseOfferVersionInput(formData);
  if (!parsed.ok) back(offerId, parsed.errors);

  const { error } = await supabase
    .from("offer_versions")
    .insert({ offer_id: offerId, version: 1, status: "draft", ...parsed.value });

  if (error) back(offerId, [error.message]);
  revalidatePath(BASE);
  back(offerId);
}

export async function updateDraftVersion(formData: FormData) {
  const { supabase } = await requireAdmin();
  const offerId = String(formData.get("offer_id") ?? "");
  const versionId = String(formData.get("version_id") ?? "");
  if (!versionId) back(offerId, ["Version is required."]);

  const parsed = parseOfferVersionInput(formData);
  if (!parsed.ok) back(offerId, parsed.errors);

  const { error } = await supabase
    .from("offer_versions")
    .update(parsed.value)
    .eq("id", versionId);

  if (error) {
    back(offerId, [
      error.message.includes("immutable")
        ? "That version is published. Open a new draft to change its terms."
        : error.message,
    ]);
  }

  revalidatePath(BASE);
  back(offerId);
}

export async function openOfferDraft(formData: FormData) {
  const { supabase } = await requireAdmin();
  const offerId = String(formData.get("offer_id") ?? "");
  if (!offerId) back(null, ["Offer is required."]);

  const { error } = await supabase.rpc("create_offer_draft", {
    p_offer_id: offerId,
    p_notes: String(formData.get("notes") ?? "").trim() || null,
  });

  if (error) back(offerId, [error.message]);
  revalidatePath(BASE);
  back(offerId);
}

export async function publishOffer(formData: FormData) {
  const { supabase } = await requireAdmin();
  const offerId = String(formData.get("offer_id") ?? "");
  const versionId = String(formData.get("version_id") ?? "");
  if (!versionId) back(offerId, ["Version is required."]);

  const { error } = await supabase.rpc("publish_offer_version", {
    p_version_id: versionId,
  });

  // publish_offer_version refuses a schema version that is not itself
  // published; say so plainly.
  if (error) {
    back(offerId, [
      error.message.includes("not published")
        ? "That version points at an unpublished schema version. Publish the vertical schema first."
        : error.message,
    ]);
  }

  revalidatePath(BASE);
  back(offerId);
}

/** Pause and resume affect marketplace visibility without touching versions. */
export async function setOfferStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const offerId = String(formData.get("offer_id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!["published", "paused", "archived"].includes(status)) {
    back(offerId, ["Unsupported offer status."]);
  }

  const { error } = await supabase
    .from("offers")
    .update({
      status,
      archived_at: status === "archived" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  if (error) back(offerId, [error.message]);
  revalidatePath(BASE);
  back(offerId);
}
