import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";

/** GET /api/v1/integrations/px/verticals — Qentrax ↔ PX vertical map */
export async function GET(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const auth = await requireAuthContext();
  if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("px_vertical_maps")
    .select(
      "qentrax_vertical_code, qentrax_product_code, px_vertical, resource_type, ping_path, post_path, docs_url, field_map_json",
    )
    .eq("active", true)
    .order("qentrax_vertical_code");

  if (error) return apiError("INTERNAL_ERROR", error.message, id, 500);
  return apiOk({ verticals: data ?? [], docs: "https://api.px.com/" }, id);
}
