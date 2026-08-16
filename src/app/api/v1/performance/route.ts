import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPerformance } from "@/lib/services/performance";
import { isMcpToken, isMcpOAuthBridge, mcpBoundOrg } from "@/lib/mcp-auth";

type MembershipRow = {
  organization_id: string;
  role: string;
  status: string;
  organizations: { type?: string } | { type?: string }[] | null;
};

function orgType(r: MembershipRow): string | undefined {
  const o = r.organizations;
  const one = Array.isArray(o) ? o[0] : o;
  return one?.type;
}

/**
 * GET/POST /api/v1/performance
 * Auth: session | MCP shared token (legacy) | MCP OAuth bridge headers
 * Org from memberships for OAuth users — never arbitrary model-supplied foreign orgs.
 */
async function handlePerformance(
  request: Request,
  params: {
    organization_id?: string | null;
    role?: string | null;
    from?: string | null;
    to?: string | null;
    vertical?: string | null;
    source_id?: string | null;
  },
) {
  const id = requestId(request.headers.get("x-request-id"));

  const bridge = isMcpOAuthBridge(request);
  const mcpLegacy = isMcpToken(request);

  let organization_id = (params.organization_id ?? "").trim();
  let role = ((params.role ?? "publisher") as string).toLowerCase() as
    | "publisher"
    | "advertiser";
  let supabase;

  if (bridge.ok && bridge.userId) {
    supabase = createAdminClient();
    const { data: memberships } = await supabase
      .from("organization_members")
      .select("organization_id, role, status, organizations(type)")
      .eq("user_id", bridge.userId)
      .eq("status", "active");

    const rows = (memberships ?? []) as MembershipRow[];
    if (rows.length === 0) {
      return apiError(
        "FORBIDDEN",
        "Authenticated user has no active organization memberships.",
        id,
        403,
      );
    }

    if (organization_id) {
      const m = rows.find((r) => r.organization_id === organization_id);
      if (!m) {
        return apiError(
          "FORBIDDEN",
          "Not a member of the requested organization.",
          id,
          403,
        );
      }
      role = orgType(m) === "advertiser" ? "advertiser" : "publisher";
    } else {
      const publishers = rows.filter((r) => orgType(r) === "publisher");
      const pool = publishers.length > 0 ? publishers : rows;
      if (pool.length !== 1) {
        return apiError(
          "ORG_AMBIGUOUS",
          "Multiple organization memberships found. Pass organization_id from your memberships only.",
          id,
          400,
        );
      }
      organization_id = pool[0].organization_id;
      role = orgType(pool[0]) === "advertiser" ? "advertiser" : "publisher";
    }
  } else if (mcpLegacy) {
    const bound = mcpBoundOrg();
    if (!bound) {
      return apiError(
        "FORBIDDEN",
        "MCP org binding not configured (QENTRAX_MCP_ORG_ID). Prefer OAuth.",
        id,
        403,
      );
    }
    organization_id = bound.organizationId;
    role = bound.role;
    supabase = createAdminClient();
  } else {
    const auth = await requireAuthContext();
    if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);
    if (!organization_id) {
      return apiError("INVALID_REQUEST", "organization_id is required.", id, 400);
    }
    supabase = await createClient();
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

  const result = await getPerformance(supabase!, {
    organization_id,
    role,
    from: params.from ?? null,
    to: params.to ?? null,
    vertical: params.vertical ?? null,
    source_id: params.source_id ?? null,
  });

  if (!result.ok) return apiError(result.error.code, result.error.message, id, 400);
  return apiOk(result, id);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return handlePerformance(request, {
    organization_id: url.searchParams.get("organization_id"),
    role: url.searchParams.get("role"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    vertical: url.searchParams.get("vertical"),
    source_id: url.searchParams.get("source_id"),
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    const id = requestId(request.headers.get("x-request-id"));
    return apiError("VALIDATION_ERROR", "Invalid JSON body.", id, 400);
  }
  return handlePerformance(request, {
    organization_id: typeof body.organization_id === "string" ? body.organization_id : null,
    role: typeof body.role === "string" ? body.role : null,
    from: typeof body.from === "string" ? body.from : null,
    to: typeof body.to === "string" ? body.to : null,
    vertical: typeof body.vertical === "string" ? body.vertical : null,
    source_id: typeof body.source_id === "string" ? body.source_id : null,
  });
}
