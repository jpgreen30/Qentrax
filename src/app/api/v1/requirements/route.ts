import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequirements } from "@/lib/services/requirements";
import { isMcpToken } from "@/lib/mcp-auth";

/**
 * GET /api/v1/requirements?vertical=&product=
 * NON-DESTRUCTIVE. No PII required.
 */
export async function GET(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const mcp = isMcpToken(request);
  if (!mcp) {
    const auth = await requireAuthContext();
    if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);
  }

  const url = new URL(request.url);
  const vertical = url.searchParams.get("vertical") ?? "";
  const product = url.searchParams.get("product");

  const supabase = mcp ? createAdminClient() : await createClient();
  const result = await getRequirements(supabase, vertical, product);

  if (!result.ok) {
    const status = result.error.code === "UNSUPPORTED_VERTICAL" ? 404 : 400;
    return apiError(result.error.code, result.error.message, id, status);
  }
  return apiOk(result, id);
}
