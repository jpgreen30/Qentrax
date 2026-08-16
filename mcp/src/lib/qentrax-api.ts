/**
 * Thin HTTP client to Qentrax application capability APIs.
 * All business logic stays in the Qentrax app — this only forwards structured calls.
 */

export type ApiFailure = {
  ok: false;
  code: string;
  message: string;
};

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

function baseUrl(): string {
  const u = (
    process.env.QENTRAX_API_BASE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://127.0.0.1:3000"
  ).replace(/\/$/, "");
  return u;
}

function mcpToken(): string {
  return (process.env.QENTRAX_MCP_TOKEN ?? "").trim();
}

async function callJson<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiSuccess<T> | ApiFailure> {
  const token = mcpToken();
  if (!token) {
    return { ok: false, code: "UNAUTHORIZED", message: "QENTRAX_MCP_TOKEN not configured." };
  }

  const url = `${baseUrl()}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
        "x-request-id": `mcp_${Date.now().toString(36)}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = (json.error as { code?: string; message?: string } | undefined) ?? {};
      return {
        ok: false,
        code: err.code ?? (res.status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR"),
        message: err.message ?? `HTTP ${res.status}`,
      };
    }

    return { ok: true, data: json as T };
  } catch (e) {
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      message: e instanceof Error ? e.message : "Qentrax API unreachable",
    };
  }
}

export function findDemandApi(input: {
  vertical: string;
  state?: string;
  product?: string;
  traffic_source?: string;
  limit?: number;
}) {
  const q = new URLSearchParams();
  q.set("vertical", input.vertical);
  if (input.state) q.set("state", input.state);
  if (input.product) q.set("product", input.product);
  if (input.traffic_source) q.set("traffic_source", input.traffic_source);
  if (input.limit) q.set("limit", String(input.limit));
  return callJson<Record<string, unknown>>("GET", `/api/v1/demand?${q}`);
}

export function getRequirementsApi(input: { vertical: string; product?: string }) {
  const q = new URLSearchParams();
  q.set("vertical", input.vertical);
  if (input.product) q.set("product", input.product);
  return callJson<Record<string, unknown>>("GET", `/api/v1/requirements?${q}`);
}

export function checkOpportunityApi(input: {
  vertical: string;
  product?: string;
  state?: string;
  attributes?: Record<string, unknown>;
  consent?: Record<string, unknown>;
  require_post?: boolean;
}) {
  return callJson<Record<string, unknown>>("POST", "/api/v1/opportunities/preflight", input);
}

export function getPerformanceApi(input: {
  from?: string;
  to?: string;
  vertical?: string;
  source_id?: string;
}) {
  const q = new URLSearchParams();
  // organization_id intentionally omitted — API binds from MCP token env
  if (input.from) q.set("from", input.from);
  if (input.to) q.set("to", input.to);
  if (input.vertical) q.set("vertical", input.vertical);
  if (input.source_id) q.set("source_id", input.source_id);
  return callJson<Record<string, unknown>>("GET", `/api/v1/performance?${q}`);
}
