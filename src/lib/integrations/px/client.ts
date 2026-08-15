import type {
  PxApiResponse,
  PxClientConfig,
  PxNormalizedResult,
  PxPingRequest,
  PxPostRequest,
  PxResourceType,
} from "./types";

const DEFAULT_BASE = "https://leadapi.px.com";

function toCents(payout: number | string | null | undefined): number | null {
  if (payout == null || payout === "") return null;
  const n = typeof payout === "number" ? payout : Number(payout);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function normalizePxResponse(raw: PxApiResponse): PxNormalizedResult {
  const transactionId = raw.TransactionId ?? raw.TransactionID ?? null;
  const success =
    raw.Success === true ||
    String(raw.Result ?? "").toLowerCase() === "baeok" ||
    String(raw.Result ?? "").toLowerCase() === "ok";

  let payoutCents = toCents(raw.Payout ?? undefined);
  if (payoutCents == null && Array.isArray(raw.Legs) && raw.Legs.length) {
    const best = raw.Legs.reduce((max, leg) => {
      const c = toCents(leg.Payout ?? undefined) ?? 0;
      return c > max ? c : max;
    }, 0);
    payoutCents = best > 0 ? best : null;
  }

  return {
    ok: success,
    transactionId,
    payoutCents,
    message: raw.Message ?? null,
    environment: raw.Environment ?? null,
    legs: raw.Legs ?? [],
    raw,
  };
}

export class PxClient {
  private baseUrl: string;
  private apiToken: string;
  private timeoutMs: number;

  constructor(config: PxClientConfig) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    this.apiToken = config.apiToken;
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  private async postJson(path: string, body: Record<string, unknown>): Promise<PxNormalizedResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const raw = (await res.json().catch(() => ({
        Success: false,
        Message: `HTTP_${res.status}`,
      }))) as PxApiResponse;
      return normalizePxResponse(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : "PX_REQUEST_FAILED";
      return {
        ok: false,
        transactionId: null,
        payoutCents: null,
        message,
        environment: null,
        legs: [],
        raw: { Success: false, Message: message },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  ping(path: string, payload: Omit<PxPingRequest, "ApiToken"> & { ApiToken?: string }) {
    return this.postJson(path, {
      ...payload,
      ApiToken: payload.ApiToken ?? this.apiToken,
    });
  }

  post(path: string, payload: Omit<PxPostRequest, "ApiToken"> & { ApiToken?: string }) {
    return this.postJson(path, {
      ...payload,
      ApiToken: payload.ApiToken ?? this.apiToken,
    });
  }

  /** Convenience for standard lead or call routes */
  pingResource(resource: PxResourceType, payload: Omit<PxPingRequest, "ApiToken">) {
    const path = resource === "call" ? "/api/call/ping" : "/api/lead/ping";
    return this.ping(path, payload);
  }

  postResource(resource: PxResourceType, payload: Omit<PxPostRequest, "ApiToken">) {
    const path = resource === "call" ? "/api/call/post" : "/api/lead/post";
    return this.post(path, payload);
  }
}
