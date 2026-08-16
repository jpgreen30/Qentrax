import { PxClient } from "@/lib/integrations/px/client";
import { resolvePxVerticalMap } from "@/lib/integrations/px/mapper";
import { toPxPingBody, toPxPostBody } from "@/lib/integrations/px/mapper";
import type { QentraxOpportunityPayload } from "@/lib/integrations/px/types";
import type {
  DemandBid,
  DemandOpportunity,
  DemandPingResult,
  DemandPostResult,
  DemandProvider,
} from "./types";

function loadPxCredentials(): { apiToken: string; baseUrl: string } | null {
  const apiToken = process.env.PX_API_TOKEN?.trim();
  if (!apiToken) return null;
  const baseUrl = (process.env.PX_BASE_URL?.trim() || "https://leadapi.px.com").replace(/\/$/, "");
  // Prevent SSRF: only allow known PX hosts unless explicitly allowlisted
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    const allowed = ["leadapi.px.com", "api.px.com"];
    const extra = (process.env.PX_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (![...allowed, ...extra].includes(host)) {
      return null;
    }
  } catch {
    return null;
  }
  return { apiToken, baseUrl };
}

function toPayload(opp: DemandOpportunity): QentraxOpportunityPayload {
  const a = { ...opp.pingAttributes, ...(opp.postAttributes ?? {}) };
  return {
    verticalCode: opp.verticalCode,
    productCode: opp.productCode,
    zip: typeof a.zip === "string" ? a.zip : undefined,
    state: typeof a.state === "string" ? a.state : undefined,
    tcpaText: typeof a.tcpa_text === "string" ? a.tcpa_text : undefined,
    firstName: typeof a.first_name === "string" ? a.first_name : undefined,
    lastName: typeof a.last_name === "string" ? a.last_name : undefined,
    email: typeof a.email === "string" ? a.email : undefined,
    phone: typeof a.phone === "string" ? a.phone : undefined,
    address1: typeof a.address1 === "string" ? a.address1 : undefined,
    city: typeof a.city === "string" ? a.city : undefined,
    attributes: a,
  };
}

export class PxDemandProvider implements DemandProvider {
  readonly name = "px";

  async isEligible(opp: DemandOpportunity): Promise<boolean> {
    const creds = loadPxCredentials();
    if (!creds) return false;
    const map = resolvePxVerticalMap(opp.verticalCode, opp.productCode ?? null);
    return map != null;
  }

  async ping(opp: DemandOpportunity): Promise<DemandPingResult> {
    const started = Date.now();
    const creds = loadPxCredentials();
    if (!creds) {
      return { status: "error", reason: "PX_CREDENTIALS_MISSING", latencyMs: 0 };
    }
    const map = resolvePxVerticalMap(opp.verticalCode, opp.productCode ?? null);
    if (!map) {
      return { status: "error", reason: "PX_MAPPING_NOT_FOUND", latencyMs: Date.now() - started };
    }
    const client = new PxClient({
      apiToken: creds.apiToken,
      baseUrl: creds.baseUrl,
      timeoutMs: 5000,
    });
    const { path, body } = toPxPingBody(toPayload(opp), map, creds.apiToken);
    const result = await client.ping(path, body);
    const latencyMs = Date.now() - started;
    if (!result.ok) {
      return {
        status: "no_bid",
        reason: result.message ?? "NO_BID",
        latencyMs,
        raw: { transactionId: result.transactionId },
      };
    }
    if (result.payoutCents == null || result.payoutCents <= 0) {
      return { status: "no_bid", reason: "ZERO_PAYOUT", latencyMs, raw: result.raw };
    }
    return {
      status: "bid",
      bid: {
        provider: "px",
        bidId: result.transactionId,
        amountCents: result.payoutCents,
        metadata: { environment: result.environment },
      },
      latencyMs,
      raw: { transactionId: result.transactionId, payoutCents: result.payoutCents },
    };
  }

  async post(opp: DemandOpportunity, bid: DemandBid): Promise<DemandPostResult> {
    const started = Date.now();
    const creds = loadPxCredentials();
    if (!creds) {
      return { status: "error", reason: "PX_CREDENTIALS_MISSING", latencyMs: 0 };
    }
    if (!bid.bidId) {
      return { status: "error", reason: "PX_MISSING_BID_ID", latencyMs: 0 };
    }
    const map = resolvePxVerticalMap(opp.verticalCode, opp.productCode ?? null);
    if (!map) {
      return { status: "error", reason: "PX_MAPPING_NOT_FOUND", latencyMs: Date.now() - started };
    }
    const client = new PxClient({
      apiToken: creds.apiToken,
      baseUrl: creds.baseUrl,
      timeoutMs: 8000,
    });
    const { path, body } = toPxPostBody(toPayload(opp), map, creds.apiToken, bid.bidId);
    const result = await client.post(path, body);
    const latencyMs = Date.now() - started;
    if (!result.ok) {
      return {
        status: "rejected",
        reason: result.message ?? "REJECTED",
        latencyMs,
        raw: { transactionId: result.transactionId },
      };
    }
    return {
      status: "accepted",
      providerTransactionId: result.transactionId,
      amountCents: result.payoutCents ?? bid.amountCents,
      latencyMs,
      raw: { transactionId: result.transactionId },
    };
  }
}

export function getConfiguredDemandProviders(): DemandProvider[] {
  const providers: DemandProvider[] = [];
  if (process.env.PX_API_TOKEN?.trim()) {
    providers.push(new PxDemandProvider());
  }
  return providers;
}
