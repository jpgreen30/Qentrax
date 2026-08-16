/** Runtime config for MCP + OAuth (no secrets logged). */

export function publicBaseUrl(reqHost?: string | null): string {
  const env = (process.env.MCP_PUBLIC_URL ?? process.env.QENTRAX_MCP_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (env) return env;
  if (reqHost) {
    const proto = process.env.MCP_PUBLIC_PROTO ?? "https";
    return `${proto}://${reqHost.replace(/\/$/, "")}`;
  }
  return "http://127.0.0.1:3100";
}

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
