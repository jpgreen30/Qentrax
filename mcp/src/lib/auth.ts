/**
 * MCP request authentication — OAuth access tokens.
 * Maps: external OAuth subject → Qentrax user id → memberships.
 */

import { publicBaseUrl } from "./config.js";
import { verifyAccessToken, type AccessPrincipal } from "../oauth/handlers.js";

export type McpAuthContext = {
  principal: string;
  userId: string;
  email?: string;
  scope: string;
  label: string;
};

export type AuthResult =
  | { ok: true; context: McpAuthContext }
  | { ok: false; code: "UNAUTHORIZED" | "FORBIDDEN"; message: string };

export function extractBearerToken(
  headers: Headers | Record<string, string | undefined>,
): string | null {
  const get = (k: string) => {
    if (headers instanceof Headers)
      return headers.get(k) ?? headers.get(k.toLowerCase());
    return headers[k] ?? headers[k.toLowerCase()];
  };
  const auth = get("authorization") ?? get("Authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || null;
  }
  return null;
}

export async function authenticateMcpRequest(
  headers: Headers | Record<string, string | undefined>,
  host?: string | null,
): Promise<AuthResult> {
  const get = (k: string) => {
    if (headers instanceof Headers)
      return headers.get(k) ?? headers.get(k.toLowerCase());
    return headers[k] ?? headers[k.toLowerCase()];
  };
  const authorization = get("authorization") ?? get("Authorization") ?? null;
  const base = publicBaseUrl(host);
  const verified = await verifyAccessToken(authorization, base);
  if (!verified.ok) {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      message: `Invalid or missing OAuth access token (${verified.error}).`,
    };
  }
  const p: AccessPrincipal = verified.principal;
  return {
    ok: true,
    context: {
      principal: "oauth_user",
      userId: p.userId,
      email: p.email,
      scope: p.scope,
      label: p.email ?? p.userId,
    },
  };
}
