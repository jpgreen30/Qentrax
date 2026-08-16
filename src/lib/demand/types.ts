/**
 * Lightweight demand-provider abstraction.
 * PX is DemandProvider #1 — not the permanent core architecture.
 */

export type DemandBid = {
  provider: string;
  bidId: string | null;
  amountCents: number;
  metadata?: Record<string, unknown>;
};

export type DemandPingResult =
  | { status: "bid"; bid: DemandBid; latencyMs: number; raw?: unknown }
  | { status: "no_bid"; reason?: string; latencyMs: number; raw?: unknown }
  | { status: "error"; reason: string; latencyMs: number; raw?: unknown }
  | { status: "timeout"; latencyMs: number };

export type DemandPostResult =
  | {
      status: "accepted";
      providerTransactionId: string | null;
      amountCents: number | null;
      latencyMs: number;
      raw?: unknown;
    }
  | {
      status: "rejected";
      reason: string;
      latencyMs: number;
      raw?: unknown;
    }
  | { status: "error"; reason: string; latencyMs: number; raw?: unknown }
  | { status: "timeout"; latencyMs: number };

export type DemandOpportunity = {
  opportunityId: string;
  publicTransactionId: string;
  verticalCode: string;
  productCode?: string | null;
  /** Non-PII attributes safe for ping */
  pingAttributes: Record<string, unknown>;
  /** Full attributes including contact — post only */
  postAttributes?: Record<string, unknown>;
};

export interface DemandProvider {
  readonly name: string;
  isEligible(opp: DemandOpportunity): Promise<boolean>;
  ping(opp: DemandOpportunity): Promise<DemandPingResult>;
  post(opp: DemandOpportunity, bid: DemandBid): Promise<DemandPostResult>;
}

/** Financial invariant helper — only accepted downstream outcomes may bill. */
export function isBillableDemandOutcome(post: DemandPostResult): boolean {
  return post.status === "accepted";
}
