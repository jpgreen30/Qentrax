import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
import { PxClient } from "@/lib/integrations/px";
import { toPxPingBody, resolvePxVerticalMap } from "@/lib/integrations/px/mapper";
import type { QentraxOpportunityPayload } from "@/lib/integrations/px/types";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/integrations/px/ping
 * PX credentials come ONLY from server env (PX_API_TOKEN / PX_BASE_URL).
 * Request body must NOT supply api_token or base_url.
 */
export async function POST(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const auth = await requireAuthContext();
  if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  let body: {
    organization_id?: string;
    opportunity?: QentraxOpportunityPayload;
    dry_run?: boolean;
    // Intentionally ignore any client-supplied credentials
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

  // Reject client-supplied credentials (SSRF / credential injection)
  if (body.api_token != null || body.base_url != null) {
    return apiError(
      "VALIDATION_ERROR",
      "api_token and base_url must not be supplied by clients. Use server configuration.",
      id,
      400,
      { reason_code: "AUTH_FORBIDDEN" },
    );
  }

  const supabase = await createClient();
  const verticalCode = body.opportunity.verticalCode;
  const productCode = body.opportunity.productCode ?? null;

  const { data: maps } = await supabase
    .from("px_vertical_maps")
    .select(
      "px_vertical, resource_type, ping_path, post_path, field_map_json, qentrax_vertical_code, qentrax_product_code",
    )
    .eq("qentrax_vertical_code", verticalCode)
    .eq("active", true);

  const mapRow = resolvePxVerticalMap(
    verticalCode,
    productCode,
    (maps as Array<
      {
        px_vertical: string;
        resource_type: "lead" | "call";
        ping_path: string;
        post_path: string;
        field_map_json: Record<string, string>;
        qentrax_vertical_code?: string;
        qentrax_product_code?: string | null;
      }
    >) ?? undefined,
  );

  if (!mapRow) {
    return apiError(
      "VALIDATION_ERROR",
      `No PX mapping for vertical '${verticalCode}'${productCode ? ` / product '${productCode}'` : ""}.`,
      id,
      400,
      { reason_code: "PX_MAPPING_NOT_FOUND" },
    );
  }

  const apiToken = process.env.PX_API_TOKEN?.trim();
  const baseUrl = process.env.PX_BASE_URL?.trim();

  const { path, body: pxBody } = toPxPingBody(
    body.opportunity,
    mapRow,
    apiToken || "DRY_RUN",
  );

  // Default dry_run when no server credentials
  if (!apiToken || body.dry_run === true) {
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

  const client = new PxClient({
    apiToken,
    baseUrl: baseUrl || undefined,
  });
  const result = await client.ping(path, pxBody);

  return apiOk(
    {
      dry_run: false,
      path,
      result: {
        ok: result.ok,
        transactionId: result.transactionId,
        payoutCents: result.payoutCents,
        message: result.message,
        environment: result.environment,
        // omit raw to reduce PII/secret leakage in API responses
      },
    },
    id,
  );
}
