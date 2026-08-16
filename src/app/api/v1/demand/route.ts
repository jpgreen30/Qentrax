import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findDemand } from "@/lib/services/demand";
import { timingSafeEqualToken } from "@/lib/mcp-auth";

/**
 * GET/POST /api/v1/demand
 * NON-DESTRUCTIVE. No PII. No distribution. No financial effect.
 * Auth: session OR Authorization: Bearer <QENTRAX_MCP_TOKEN>
 */
async function authorize(request: Request): Promise<"session" | "mcp" | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const expected = (process.env.QENTRAX_MCP_TOKEN ?? "").trim();
  if (token && expected && timingSafeEqualToken(token, expected)) return "mcp";

  const session = await requireAuthContext();
  return session ? "session" : null;
}

async function supabaseFor(mode: "session" | "mcp") {
  return mode === "mcp" ? createAdminClient() : await createClient();
}

export async function GET(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const mode = await authorize(request);
  if (!mode) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  const url = new URL(request.url);
  const supabase = await supabaseFor(mode);
  const result = await findDemand(supabase, {
    vertical: url.searchParams.get("vertical") ?? "",
    state: url.searchParams.get("state"),
    product: url.searchParams.get("product"),
    traffic_source: url.searchParams.get("traffic_source"),
    limit: url.searchParams.get("limit")
      ? Number(url.searchParams.get("limit"))
      : undefined,
  });

  if (!result.ok) return apiError(result.error.code, result.error.message, id, 400);
  return apiOk(result, id);
}

export async function POST(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const mode = await authorize(request);
  if (!mode) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  let body: {
    vertical?: string;
    state?: string;
    product?: string;
    traffic_source?: string;
    limit?: number;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body.", id, 400);
  }

  const supabase = await supabaseFor(mode);
  const result = await findDemand(supabase, {
    vertical: body.vertical ?? "",
    state: body.state,
    product: body.product,
    traffic_source: body.traffic_source,
    limit: body.limit,
  });

  if (!result.ok) return apiError(result.error.code, result.error.message, id, 400);
  return apiOk(result, id);
}
