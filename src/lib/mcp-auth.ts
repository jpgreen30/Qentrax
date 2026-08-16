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

/** Org binding for MCP — never taken from model-supplied args. */
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
