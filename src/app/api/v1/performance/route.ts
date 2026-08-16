import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPerformance } from "@/lib/services/performance";
import { isMcpToken, mcpBoundOrg } from "@/lib/mcp-auth";

/**
 * GET /api/v1/performance
 * NON-DESTRUCTIVE. Org is session membership OR MCP-bound env org.
 * Model cannot force a foreign organization_id when using MCP token.
 */
export async function GET(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const url = new URL(request.url);
  const mcp = isMcpToken(request);

  let organization_id = url.searchParams.get("organization_id") ?? "";
  let role = (url.searchParams.get("role") ?? "publisher") as "publisher" | "advertiser";

  if (mcp) {
    const bound = mcpBoundOrg();
    if (!bound) {
      return apiError(
        "FORBIDDEN",
        "MCP org binding not configured (QENTRAX_MCP_ORG_ID).",
        id,
        403,
      );
    }
    // Ignore model-supplied organization_id — always use bound org
    organization_id = bound.organizationId;
    role = bound.role;
  } else {
    const auth = await requireAuthContext();
    if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);
    if (!organization_id) {
      return apiError("INVALID_REQUEST", "organization_id is required.", id, 400);
    }
    const supabase = await createClient();
    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("user_id", auth.userId)
      .eq("status", "active")
      .maybeSingle();
    if (!membership) {
      const { data: isAdmin } = await supabase.rpc("is_platform_admin");
      if (!isAdmin) {
        return apiError("AUTH_FORBIDDEN", "Not a member of this organization.", id, 403);
      }
    }
  }

  if (role !== "publisher" && role !== "advertiser") {
    return apiError("INVALID_REQUEST", "role must be publisher or advertiser.", id, 400);
  }

  const supabase = mcp ? createAdminClient() : await createClient();
  const result = await getPerformance(supabase, {
    organization_id,
    role,
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    vertical: url.searchParams.get("vertical"),
    source_id: url.searchParams.get("source_id"),
  });

  if (!result.ok) return apiError(result.error.code, result.error.message, id, 400);
  return apiOk(result, id);
}
