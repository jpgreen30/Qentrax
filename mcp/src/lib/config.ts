/**
 * Runtime config for MCP + OAuth (no secrets logged).
 *
 * CRITICAL SEPARATION:
 * - MCP_PUBLIC_URL is the ONLY source of the public MCP resource / OAuth issuer.
 * - Supabase (NEXT_PUBLIC_SUPABASE_URL) is used solely for Auth credential
 *   verification and membership reads. It must NEVER be used as the MCP
 *   resource, authorization server, or issuer.
 *
 * Production: set MCP_PUBLIC_URL=https://mcp.qentrax.io
 * Resource becomes https://mcp.qentrax.io/mcp
 */

/**
 * Canonical public base URL of this MCP service (no trailing slash).
 * Prefer MCP_PUBLIC_URL; fall back only for local development.
 * Never derives from Supabase or Qentrax app URLs.
 */
export function publicBaseUrl(reqHost?: string | null): string {
  const env = (process.env.MCP_PUBLIC_URL ?? process.env.QENTRAX_MCP_PUBLIC_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (env) {
    // Guard: reject accidental Supabase origin
    if (env.includes("supabase.co")) {
      throw new Error(
        "MCP_PUBLIC_URL must not be a Supabase origin. Set it to the MCP host (e.g. https://mcp.qentrax.io).",
      );
    }
    return env;
  }
  if (reqHost) {
    const host = reqHost.replace(/\/$/, "");
    if (host.includes("supabase.co")) {
      throw new Error("Request host must not be a Supabase origin for MCP public base URL.");
    }
    const proto = process.env.MCP_PUBLIC_PROTO ?? "https";
    return `${proto}://${host}`;
  }
  return "http://127.0.0.1:3100";
}

/** Canonical MCP resource identifier (audience) for tokens and PRM. */
export function mcpResourceUrl(base?: string): string {
  const b = (base ?? publicBaseUrl()).replace(/\/$/, "");
  return `${b}/mcp`;
}

export const SCOPES = [
  "openid",
  "email",
  "profile",
  "offline_access",
  "qentrax:demand:read",
  "qentrax:requirements:read",
  "qentrax:opportunity:preflight",
  "qentrax:performance:read",
] as const;

export type Scope = (typeof SCOPES)[number];
