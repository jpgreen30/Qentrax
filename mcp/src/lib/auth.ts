/**
 * Phase-1 prototype authentication.
 *
 * ChatGPT / MCP clients present: Authorization: Bearer <QENTRAX_MCP_TOKEN>
 * Token is validated against env. Identity is provider-neutral:
 *   external credential → Qentrax org context → role
 *
 * Before directory submission, replace with OAuth account linking:
 *   external subject → public.users.auth_subject → organization_members
 */

export type McpAuthContext = {
  /** Opaque prototype principal */
  principal: string;
  organizationId: string;
  role: "publisher" | "advertiser";
  /** Display label for logs only — not PII from consumer leads */
  label: string;
};

export type AuthResult =
  | { ok: true; context: McpAuthContext }
  | { ok: false; code: "UNAUTHORIZED" | "FORBIDDEN"; message: string };

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/**
 * Extract Bearer token from request headers (Authorization or X-Qentrax-Token).
 */
export function extractBearerToken(headers: Headers | Record<string, string | undefined>): string | null {
  const get = (k: string) => {
    if (headers instanceof Headers) return headers.get(k) ?? headers.get(k.toLowerCase());
    return headers[k] ?? headers[k.toLowerCase()];
  };
  const auth = get("authorization") ?? get("Authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || null;
  }
  const alt = get("x-qentrax-token") ?? get("X-Qentrax-Token");
  return alt?.trim() || null;
}

/**
 * Validate prototype MCP token and bind organization context from env.
 * The model cannot supply organization_id — it is always derived here.
 */
export function authenticateMcpRequest(
  headers: Headers | Record<string, string | undefined>,
): AuthResult {
  const expected = (process.env.QENTRAX_MCP_TOKEN ?? "").trim();
  if (!expected || expected.length < 16) {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      message: "MCP authentication is not configured (QENTRAX_MCP_TOKEN).",
    };
  }

  const token = extractBearerToken(headers);
  if (!token || !timingSafeEqual(token, expected)) {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      message: "Invalid or missing MCP token.",
    };
  }

  const organizationId = (process.env.QENTRAX_MCP_ORG_ID ?? "").trim();
  if (!organizationId) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "MCP org binding is not configured (QENTRAX_MCP_ORG_ID).",
    };
  }

  const roleRaw = (process.env.QENTRAX_MCP_ROLE ?? "publisher").trim().toLowerCase();
  const role: "publisher" | "advertiser" =
    roleRaw === "advertiser" ? "advertiser" : "publisher";

  return {
    ok: true,
    context: {
      principal: "mcp_prototype",
      organizationId,
      role,
      label: process.env.QENTRAX_MCP_LABEL?.trim() || "Qentrax MCP prototype",
    },
  };
}
