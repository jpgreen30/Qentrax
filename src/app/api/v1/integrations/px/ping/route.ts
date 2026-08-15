import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
import { PxClient } from "@/lib/integrations/px";
import { toPxPingBody, PX_VERTICAL_FALLBACK } from "@/lib/integrations/px/mapper";
import type { QentraxOpportunityPayload } from "@/lib/integrations/px/types";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/integrations/px/ping
 * Dry-run or live PX ping using org integration credentials.
 * Body: { organization_id, opportunity, dry_run?: boolean }
 */
export async function POST(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const auth = await requireAuthContext();
  if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  let body: {
    organization_id?: string;
    opportunity?: QentraxOpportunityPayload;
    dry_run?: boolean;
    api_token?: string;
    base_url?: string;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body.", id, 400);
  }

  if (!body.organization_id || !body.opportunity?.verticalCode) {
    return apiError(
      "VALIDATION_ERROR",
      "organization_id and opportunity.verticalCode are required.",
      id,
      400,
    );
  }

  const supabase = await createClient();
  const verticalCode = body.opportunity.verticalCode;
  const productCode = body.opportunity.productCode ?? null;

  let mapRow = null as null | {
    px_vertical: string;
    resource_type: "lead" | "call";
    ping_path: string;
    post_path: string;
    field_map_json: Record<string, string>;
  };

  const { data: maps } = await supabase
    .from("px_vertical_maps")
    .select("px_vertical, resource_type, ping_path, post_path, field_map_json")
    .eq("qentrax_vertical_code", verticalCode)
    .eq("active", true);

  if (maps?.length) {
    mapRow =
      (productCode
        ? maps.find(() => true) // prefer first; product filter optional
        : maps[0]) ?? maps[0];
    // Prefer product match when present in DB via second query pattern — use first matching product
    const { data: productMap } = productCode
      ? await supabase
          .from("px_vertical_maps")
          .select("px_vertical, resource_type, ping_path, post_path, field_map_json")
          .eq("qentrax_vertical_code", verticalCode)
          .eq("qentrax_product_code", productCode)
          .eq("active", true)
          .maybeSingle()
      : { data: null };
    if (productMap) mapRow = productMap as typeof mapRow;
  }

  if (!mapRow) {
    const fb = PX_VERTICAL_FALLBACK[verticalCode] ?? PX_VERTICAL_FALLBACK.auto;
    mapRow = fb;
  }

  const { path, body: pxBody } = toPxPingBody(body.opportunity, mapRow, body.api_token ?? "DRY_RUN");

  if (body.dry_run !== false && !body.api_token) {
    return apiOk(
      {
        dry_run: true,
        path,
        px_body: { ...pxBody, ApiToken: "[redacted]" },
        map: mapRow,
      },
      id,
    );
  }

  if (!body.api_token) {
    return apiError("VALIDATION_ERROR", "api_token required for live ping.", id, 400);
  }

  const client = new PxClient({
    apiToken: body.api_token,
    baseUrl: body.base_url,
  });
  const result = await client.ping(path, pxBody);

  return apiOk(
    {
      dry_run: false,
      path,
      result,
    },
    id,
  );
}
