/** Timing-safe token compare for MCP prototype auth. */
export function timingSafeEqualToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function isMcpToken(request: Request): boolean {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const expected = (process.env.QENTRAX_MCP_TOKEN ?? "").trim();
  return Boolean(token && expected && timingSafeEqualToken(token, expected));
}

/**
 * OAuth Phase 1.5 bridge: MCP sends x-qentrax-oauth-user-id + x-qentrax-mcp-bridge.
 * Accept only when the bridge secret matches (timing-safe).
 */
export function isMcpOAuthBridge(request: Request): {
  ok: boolean;
  userId?: string;
} {
  const userId = request.headers.get("x-qentrax-oauth-user-id")?.trim() || "";
  const bridgeSecret = request.headers.get("x-qentrax-mcp-bridge")?.trim() || "";
  const expected = (
    process.env.QENTRAX_MCP_BRIDGE_SECRET ??
    process.env.MCP_JWT_SECRET ??
    process.env.QENTRAX_MCP_TOKEN ??
    ""
  ).trim();
  if (!userId || !expected || !timingSafeEqualToken(bridgeSecret, expected)) {
    return { ok: false };
  }
  return { ok: true, userId };
}

/** True if request is either legacy shared-token or OAuth bridge. */
export function isMcpRequest(request: Request): boolean {
  return isMcpToken(request) || isMcpOAuthBridge(request).ok;
}

/** Org binding for legacy MCP shared-token — never taken from model-supplied args. */
export function mcpBoundOrg(): {
  organizationId: string;
  role: "publisher" | "advertiser";
} | null {
  const organizationId = (process.env.QENTRAX_MCP_ORG_ID ?? "").trim();
  if (!organizationId) return null;
  const roleRaw = (process.env.QENTRAX_MCP_ROLE ?? "publisher").trim().toLowerCase();
  return {
    organizationId,
    role: roleRaw === "advertiser" ? "advertiser" : "publisher",
  };
}
