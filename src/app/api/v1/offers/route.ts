import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/offers — the marketplace listing.
 *
 * Visibility is enforced by RLS on public.offers and public.offer_versions, so
 * an unpublished offer is invisible here regardless of the query. This route
 * only narrows what RLS already permits.
 */
export async function GET(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const auth = await requireAuthContext();
  if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  const url = new URL(request.url);
  const verticalId = url.searchParams.get("vertical_id");
  const leadType = url.searchParams.get("lead_type");

  const supabase = await createClient();

  let query = supabase
    .from("offers")
    .select(
      `id, name, slug, description, status, vertical_id, product_id, published_at,
       verticals ( code, name ),
       offer_versions!offers_current_version_id_fkey (
         id, version, lead_type, pricing_mode, price_cents, floor_cents,
         ceiling_cents, geo_rules_json, requirements_json, return_policy_json,
         max_lead_age_seconds, schema_version_id
       )`,
    )
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (verticalId) query = query.eq("vertical_id", verticalId);

  const { data, error } = await query;
  if (error) return apiError("INTERNAL_ERROR", error.message, id, 500);

  let offers = data ?? [];
  if (leadType) {
    offers = offers.filter((o) => {
      const v = o.offer_versions as { lead_type?: string } | null;
      return v?.lead_type === leadType;
    });
  }

  return apiOk({ offers, count: offers.length }, id);
}
