/**
 * Thin HTTP client to Qentrax application capability APIs.
 * Forwards the caller's OAuth access token (or uses service path with user context headers).
 */

export type ApiFailure = { ok: false; code: string; message: string };
export type ApiSuccess<T> = { ok: true; data: T };

function baseUrl(): string {
  return (
    process.env.QENTRAX_API_BASE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://127.0.0.1:3000"
  ).replace(/\/$/, "");
}

async function callJson<T>(
  method: string,
  path: string,
  opts: {
    body?: unknown;
    accessToken?: string;
    userId?: string;
  },
): Promise<ApiSuccess<T> | ApiFailure> {
  const url = `${baseUrl()}${path}`;
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      "x-request-id": `mcp_${Date.now().toString(36)}`,
    };
    if (opts.accessToken) {
      headers.authorization = `Bearer ${opts.accessToken}`;
    }
    // Bridge: MCP identifies the Supabase user for server-side membership checks
    if (opts.userId) {
      headers["x-qentrax-oauth-user-id"] = opts.userId;
      const bridge = (process.env.QENTRAX_MCP_BRIDGE_SECRET ?? process.env.MCP_JWT_SECRET ?? "").trim();
      if (bridge) headers["x-qentrax-mcp-bridge"] = bridge;
    }
    const res = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* */
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } })?.error;
      return {
        ok: false,
        code: err?.code ?? `HTTP_${res.status}`,
        message: err?.message ?? text.slice(0, 300) || res.statusText,
      };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    return {
      ok: false,
      code: "UPSTREAM_ERROR",
      message: e instanceof Error ? e.message : "Upstream call failed",
    };
  }
}

export function findDemandApi(
  args: Record<string, unknown>,
  ctx: { accessToken?: string; userId?: string },
) {
  return callJson("POST", "/api/v1/demand", { body: args, ...ctx });
}

export function getRequirementsApi(
  args: Record<string, unknown>,
  ctx: { accessToken?: string; userId?: string },
) {
  return callJson("POST", "/api/v1/requirements", { body: args, ...ctx });
}

export function checkOpportunityApi(
  args: Record<string, unknown>,
  ctx: { accessToken?: string; userId?: string },
) {
  return callJson("POST", "/api/v1/opportunities/preflight", { body: args, ...ctx });
}

export function getPerformanceApi(
  args: Record<string, unknown>,
  ctx: { accessToken?: string; userId?: string },
) {
  return callJson("POST", "/api/v1/performance", { body: args, ...ctx });
}
