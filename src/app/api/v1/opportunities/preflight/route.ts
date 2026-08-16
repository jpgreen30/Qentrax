import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkOpportunity } from "@/lib/services/opportunity-preflight";
import { isMcpToken } from "@/lib/mcp-auth";

/**
 * POST /api/v1/opportunities/preflight
 * NON-DESTRUCTIVE — no insert, auction, delivery, or economics.
 */
export async function POST(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const mcp = isMcpToken(request);
  if (!mcp) {
    const auth = await requireAuthContext();
    if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);
  }

  let body: {
    vertical?: string;
    product?: string;
    attributes?: Record<string, unknown>;
    consumer?: Record<string, unknown>;
    consent?: Record<string, unknown>;
    require_post?: boolean;
    state?: string;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body.", id, 400);
  }

  if (!body.vertical) {
    return apiError("INVALID_REQUEST", "vertical is required.", id, 400);
  }

  // Data minimization: drop contact fields unless explicitly needed for require_post
  if (!body.require_post && body.consumer) {
    const { email, phone, first_name, last_name, firstName, lastName, address1, ...rest } =
      body.consumer as Record<string, unknown>;
    body.consumer = rest;
    void email;
    void phone;
    void first_name;
    void last_name;
    void firstName;
    void lastName;
    void address1;
  }

  const supabase = mcp ? createAdminClient() : await createClient();
  const result = await checkOpportunity(supabase, {
    vertical: body.vertical,
    product: body.product,
    attributes: body.attributes,
    consumer: body.consumer,
    consent: body.consent,
    require_post: body.require_post,
    state: body.state,
  });

  if (!result.ok) {
    const status = result.error.code === "UNSUPPORTED_VERTICAL" ? 404 : 400;
    return apiError(result.error.code, result.error.message, id, status);
  }
  return apiOk(result, id);
}
