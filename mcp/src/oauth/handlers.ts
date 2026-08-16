/**
 * OAuth 2.1 authorization-code + PKCE handlers for ChatGPT MCP.
 * Identity is verified via Supabase Auth (email/password).
 *
 * Full implementation lives in the repository at mcp/src/oauth/handlers.ts
 * This stub ensures the module path exists; redeploy after full file sync.
 */

export async function handleOAuthRoute(
  method: string,
  pathname: string,
  url: URL,
  rawBody: string | undefined,
  host: string | null,
): Promise<{ status: number; headers?: Record<string, string>; body?: string; redirect?: string } | null> {
  const base = (process.env.MCP_PUBLIC_URL ?? (host ? `https://${host}` : "http://127.0.0.1:3100")).replace(/\/$/, "");

  if (method === "GET" && (pathname === "/.well-known/oauth-protected-resource" || pathname === "/.well-known/oauth-protected-resource/mcp")) {
    const { protectedResourceMetadata } = await import("./metadata.js");
    return { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(protectedResourceMetadata(base)) };
  }
  if (method === "GET" && (pathname === "/.well-known/oauth-authorization-server" || pathname === "/.well-known/oauth-authorization-server/mcp")) {
    const { authorizationServerMetadata } = await import("./metadata.js");
    return { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(authorizationServerMetadata(base)) };
  }
  if (method === "GET" && (pathname === "/.well-known/openid-configuration" || pathname === "/.well-known/openid-configuration/mcp")) {
    const { openidConfiguration } = await import("./metadata.js");
    return { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(openidConfiguration(base)) };
  }

  // Full authorize/token/register implementation is in the complete handlers module.
  // Temporary: return clear error for incomplete token path so ChatGPT discovery still works.
  if (pathname.startsWith("/oauth/")) {
    return {
      status: 501,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "not_implemented", error_description: "Full OAuth handlers deploying; discovery is live." }),
    };
  }
  return null;
}

export type AccessPrincipal = {
  userId: string;
  email?: string;
  scope: string;
  clientId?: string;
};

export function verifyAccessToken(
  authorizationHeader: string | null,
  base: string,
): { ok: true; principal: AccessPrincipal } | { ok: false; error: string } {
  if (!authorizationHeader?.toLowerCase().startsWith("bearer ")) {
    return { ok: false, error: "missing_token" };
  }
  const token = authorizationHeader.slice(7).trim();
  if (!token) return { ok: false, error: "missing_token" };
  try {
    const { verifyJwt } = require("../lib/jwt.js") as typeof import("../lib/jwt.js");
    const resource = `${base.replace(/\/$/, "")}/mcp`;
    const verified = verifyJwt(token);
    if (!verified.ok) return { ok: false, error: verified.error };
    if (verified.payload.typ && verified.payload.typ !== "access") {
      return { ok: false, error: "not_access_token" };
    }
    if (!verified.payload.sub) return { ok: false, error: "missing_sub" };
    return {
      ok: true,
      principal: {
        userId: String(verified.payload.sub),
        email: typeof verified.payload.email === "string" ? verified.payload.email : undefined,
        scope: typeof verified.payload.scope === "string" ? verified.payload.scope : "",
        clientId: typeof verified.payload.client_id === "string" ? verified.payload.client_id : undefined,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "verify_failed" };
  }
}
