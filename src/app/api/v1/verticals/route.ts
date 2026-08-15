import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
import { PRIMARY_VERTICAL_CODES } from "@/lib/verticals";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";

/** GET /api/v1/verticals — catalog + optional field schemas */
export async function GET(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const auth = await requireAuthContext();
  if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  const url = new URL(request.url);
  const includeFields = url.searchParams.get("fields") === "1";
  const code = url.searchParams.get("code");

  const supabase = await createClient();

  let verticalQuery = supabase
    .from("verticals")
    .select("id, code, name, active")
    .eq("active", true)
    .order("name");

  if (code) verticalQuery = verticalQuery.eq("code", code);

  const { data: verticals, error } = await verticalQuery;
  if (error) return apiError("INTERNAL_ERROR", error.message, id, 500);

  const { data: products } = await supabase
    .from("products")
    .select("id, vertical_id, code, name, active")
    .eq("active", true);

  let fieldSchemas: unknown[] = [];
  if (includeFields) {
    let fsQuery = supabase
      .from("vertical_field_schemas")
      .select(
        "vertical_code, product_code, phase, field_key, label, data_type, required, pii, enum_values_json, description, px_field, sort_order",
      )
      .eq("active", true)
      .order("sort_order");
    if (code) fsQuery = fsQuery.eq("vertical_code", code);
    else fsQuery = fsQuery.in("vertical_code", PRIMARY_VERTICAL_CODES);
    const { data } = await fsQuery;
    fieldSchemas = data ?? [];
  }

  const primary = new Set(PRIMARY_VERTICAL_CODES);
  const enriched = (verticals ?? []).map((v) => ({
    ...v,
    primary: primary.has(v.code as (typeof PRIMARY_VERTICAL_CODES)[number]),
    products: (products ?? []).filter((p) => p.vertical_id === v.id),
  }));

  return apiOk(
    {
      verticals: enriched,
      primary_codes: PRIMARY_VERTICAL_CODES,
      ...(includeFields ? { field_schemas: fieldSchemas } : {}),
    },
    id,
  );
}
