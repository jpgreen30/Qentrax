import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequirements } from "@/lib/services/requirements";
import { isMcpRequest } from "@/lib/mcp-auth";

/**
 * GET/POST /api/v1/requirements
 * NON-DESTRUCTIVE. No PII required.
 * Auth: session | legacy MCP token | OAuth bridge headers
 */
async function authorize(request: Request): Promise<"session" | "mcp" | null> {
  if (isMcpRequest(request)) return "mcp";
  const session = await requireAuthContext();
  return session ? "session" : null;
}

export async function GET(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const mode = await authorize(request);
  if (!mode) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  const url = new URL(request.url);
  const vertical = url.searchParams.get("vertical") ?? "";
  const product = url.searchParams.get("product");

  const supabase = mode === "mcp" ? createAdminClient() : await createClient();
  const result = await getRequirements(supabase, vertical, product);

  if (!result.ok) {
    const status = result.error.code === "UNSUPPORTED_VERTICAL" ? 404 : 400;
    return apiError(result.error.code, result.error.message, id, status);
  }
  return apiOk(result, id);
}

export async function POST(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const mode = await authorize(request);
  if (!mode) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  let body: { vertical?: string; product?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body.", id, 400);
  }

  const supabase = mode === "mcp" ? createAdminClient() : await createClient();
  const result = await getRequirements(supabase, body.vertical ?? "", body.product);

  if (!result.ok) {
    const status = result.error.code === "UNSUPPORTED_VERTICAL" ? 404 : 400;
    return apiError(result.error.code, result.error.message, id, status);
  }
  return apiOk(result, id);
}
