/**
 * Canonical deterministic routing engine.
 *
 * Eligibility is evaluated before selection. Rotating strategies obtain an
 * atomic cursor from Postgres; pure selectors remain deterministic and easy to
 * test independently.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { checkCampaignEligibility } from "./eligibility";

export type RoutingInput = {
  opportunity_id: string;
  vertical_id: string;
  product_id?: string | null;
  consumer?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
};

export type RoutingCandidate = {
  campaign_id: string;
  eligible: boolean;
  bid_cents: number | null;
  bid_type: string;
  rank: number;
  weight: number;
  priority: number;
  remaining_capacity: number | null;
  reason_code?: string;
};

export type RoutingDecision = {
  opportunity_id: string;
  eligible_candidates: RoutingCandidate[];
  winning_campaign_id: string | null;
  winning_bid_cents: number | null;
  decision_reason: string;
  strategy: RoutingStrategy;
  latency_ms: number;
};

export enum RoutingStrategy {
  ROUND_ROBIN = "round_robin",
  WEIGHTED_ROUND_ROBIN = "weighted_round_robin",
  HIGHEST_BID = "highest_bid",
  PRIORITY = "priority",
  WATERFALL = "waterfall",
  CAPACITY = "capacity",
  GEO_ONLY = "geo_only",
  HYBRID = "hybrid",
}

const rotatingStrategies = new Set<RoutingStrategy>([
  RoutingStrategy.ROUND_ROBIN,
  RoutingStrategy.WEIGHTED_ROUND_ROBIN,
]);

export async function runAuction(
  supabase: SupabaseClient,
  input: RoutingInput,
  strategy: RoutingStrategy = RoutingStrategy.HIGHEST_BID,
): Promise<RoutingDecision> {
  const startTime = Date.now();
  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select(
      "id, status, base_bid_cents, bid_type, targeting_json, routing_weight, routing_priority",
    )
    .eq("status", "active")
    .gt("base_bid_cents", 0)
    .order("id", { ascending: true });

  if (error || !campaigns) {
    return emptyDecision(input, strategy, startTime, "NO_CAMPAIGNS_TO_EVALUATE");
  }

  const candidates: RoutingCandidate[] = [];
  for (const [rank, campaign] of campaigns.entries()) {
    const eligibility = await checkCampaignEligibility(supabase, {
      campaign_id: campaign.id,
      opportunity_id: input.opportunity_id,
      vertical_id: input.vertical_id,
      product_id: input.product_id,
      consumer: input.consumer,
      attributes: input.attributes,
    });

    candidates.push({
      campaign_id: campaign.id,
      eligible: eligibility.eligible,
      bid_cents: eligibility.bid_cents ?? null,
      bid_type: eligibility.bid_type ?? "fixed",
      rank,
      weight: positiveInteger(
        eligibility.weight ?? campaign.routing_weight,
        100,
      ),
      priority: nonNegativeInteger(
        eligibility.priority ?? campaign.routing_priority,
        100,
      ),
      remaining_capacity: eligibility.remaining_capacity ?? null,
      reason_code: eligibility.reason_code,
    });
  }

  const eligibleCandidates = candidates.filter((candidate) => candidate.eligible);
  if (eligibleCandidates.length === 0) {
    return emptyDecision(
      input,
      strategy,
      startTime,
      "NO_ELIGIBLE_BUYERS",
      candidates,
    );
  }

  let allocationPosition = 0;
  if (rotatingStrategies.has(strategy)) {
    const scopeKey = [input.vertical_id, input.product_id ?? "*"].join(":");
    const { data, error: allocationError } = await supabase.rpc(
      "next_routing_position",
      { p_scope_key: scopeKey, p_strategy: strategy },
    );

    if (allocationError || data === null || data === undefined) {
      return emptyDecision(
        input,
        strategy,
        startTime,
        "ALLOCATION_STATE_UNAVAILABLE",
        candidates,
      );
    }
    allocationPosition = Number(data);
  }

  const winner = selectWinnerByStrategy(
    eligibleCandidates,
    strategy,
    allocationPosition,
  );

  if (!winner) {
    return emptyDecision(
      input,
      strategy,
      startTime,
      "NO_WINNER_SELECTED",
      candidates,
    );
  }

  return {
    opportunity_id: input.opportunity_id,
    eligible_candidates: candidates,
    winning_campaign_id: winner.campaign_id,
    winning_bid_cents: winner.bid_cents,
    decision_reason: "WON_AUCTION",
    strategy,
    latency_ms: Date.now() - startTime,
  };
}

export function selectWinnerByStrategy(
  candidates: RoutingCandidate[],
  strategy: RoutingStrategy,
  allocationPosition = 0,
): RoutingCandidate | null {
  const eligible = candidates
    .filter((candidate) => candidate.eligible)
    .sort((left, right) => left.rank - right.rank || left.campaign_id.localeCompare(right.campaign_id));

  if (eligible.length === 0) return null;

  switch (strategy) {
    case RoutingStrategy.ROUND_ROBIN:
      return eligible[mod(allocationPosition, eligible.length)];
    case RoutingStrategy.WEIGHTED_ROUND_ROBIN:
      return selectWeighted(eligible, allocationPosition);
    case RoutingStrategy.PRIORITY:
      return [...eligible].sort(
        (left, right) =>
          left.priority - right.priority ||
          compareBidDescending(left, right) ||
          left.rank - right.rank,
      )[0];
    case RoutingStrategy.WATERFALL:
    case RoutingStrategy.GEO_ONLY:
      return eligible[0];
    case RoutingStrategy.CAPACITY:
      return [...eligible].sort(
        (left, right) =>
          capacity(right) - capacity(left) ||
          compareBidDescending(left, right) ||
          left.rank - right.rank,
      )[0];
    case RoutingStrategy.HYBRID:
      return [...eligible].sort(
        (left, right) =>
          hybridScore(right) - hybridScore(left) ||
          left.rank - right.rank,
      )[0];
    case RoutingStrategy.HIGHEST_BID:
    default:
      return [...eligible].sort(
        (left, right) =>
          compareBidDescending(left, right) ||
          left.rank - right.rank ||
          left.campaign_id.localeCompare(right.campaign_id),
      )[0];
  }
}

function selectWeighted(
  candidates: RoutingCandidate[],
  allocationPosition: number,
): RoutingCandidate {
  const totalWeight = candidates.reduce(
    (sum, candidate) => sum + positiveInteger(candidate.weight, 1),
    0,
  );
  let slot = mod(allocationPosition, totalWeight);
  for (const candidate of candidates) {
    const weight = positiveInteger(candidate.weight, 1);
    if (slot < weight) return candidate;
    slot -= weight;
  }
  return candidates[candidates.length - 1];
}

function compareBidDescending(
  left: RoutingCandidate,
  right: RoutingCandidate,
): number {
  return (right.bid_cents ?? 0) - (left.bid_cents ?? 0);
}

function capacity(candidate: RoutingCandidate): number {
  return candidate.remaining_capacity ?? Number.MAX_SAFE_INTEGER;
}

function hybridScore(candidate: RoutingCandidate): number {
  const bid = candidate.bid_cents ?? 0;
  const priorityBonus = Math.max(0, 1000 - candidate.priority);
  const capacityBonus = Math.min(capacity(candidate), 1000);
  return bid * 1000 + priorityBonus + capacityBonus;
}

function positiveInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
}

function mod(value: number, divisor: number): number {
  return ((Math.trunc(value) % divisor) + divisor) % divisor;
}

function emptyDecision(
  input: RoutingInput,
  strategy: RoutingStrategy,
  startTime: number,
  reason: string,
  candidates: RoutingCandidate[] = [],
): RoutingDecision {
  return {
    opportunity_id: input.opportunity_id,
    eligible_candidates: candidates,
    winning_campaign_id: null,
    winning_bid_cents: null,
    decision_reason: reason,
    strategy,
    latency_ms: Date.now() - startTime,
  };
}
