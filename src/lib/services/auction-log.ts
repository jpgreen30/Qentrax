/**
 * Auction decision recording: immutable, auditable log of routing decisions.
 *
 * Every auction generates:
 * 1. auction_runs — the overall auction execution
 * 2. auction_candidates — evaluation of each campaign
 *
 * This allows reproduction of decisions and historical analysis.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoutingDecision, RoutingCandidate } from "./routing";

export type RecordAuctionInput = {
  opportunity_id: string;
  decision: RoutingDecision;
};

export type AuctionLogRecord = {
  auction_run_id: string;
  candidates_recorded: number;
};

/**
 * Record auction decision to database.
 * Creates auction_run and auction_candidate records for audit trail.
 */
export async function recordAuctionDecision(
  supabase: SupabaseClient,
  input: RecordAuctionInput,
): Promise<AuctionLogRecord> {
  const { opportunity_id, decision } = input;

  // Create auction run record
  const { data: auctionRun, error: auctionError } = await supabase
    .from("auction_runs")
    .insert({
      opportunity_id,
      status: decision.winning_campaign_id ? "completed" : "completed",
      started_at: new Date(Date.now() - decision.latency_ms).toISOString(),
      completed_at: new Date().toISOString(),
      winning_campaign_id: decision.winning_campaign_id,
      winning_bid_cents: decision.winning_bid_cents,
      decision_reason: decision.decision_reason,
    })
    .select("id")
    .single();

  if (auctionError || !auctionRun) {
    throw new Error(`Failed to record auction run: ${auctionError?.message}`);
  }

  // Record each candidate evaluation
  const candidateInserts = decision.eligible_candidates.map((candidate, index) => ({
    auction_run_id: auctionRun.id,
    campaign_id: candidate.campaign_id,
    eligible: candidate.eligible,
    bid_cents: candidate.bid_cents,
    rank: index,
    reason_codes_json: candidate.reason_code ? [candidate.reason_code] : [],
    rule_snapshot_json: {
      bid_type: candidate.bid_type,
      reason_code: candidate.reason_code,
      strategy: decision.strategy,
      weight: candidate.weight,
      priority: candidate.priority,
      remaining_capacity: candidate.remaining_capacity,
    },
  }));

  const { error: candidatesError, data: candidatesData } = await supabase
    .from("auction_candidates")
    .insert(candidateInserts)
    .select("id");

  if (candidatesError) {
    throw new Error(`Failed to record auction candidates: ${candidatesError.message}`);
  }

  return {
    auction_run_id: auctionRun.id,
    candidates_recorded: candidatesData?.length || 0,
  };
}

/**
 * Get auction decision by opportunity ID (for explanation/audit).
 */
export async function getAuctionDecision(
  supabase: SupabaseClient,
  opportunityId: string,
): Promise<{
  auction_run: Record<string, unknown> | null;
  candidates: RoutingCandidate[] | null;
} | null> {
  const { data: auctionRun } = await supabase
    .from("auction_runs")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .maybeSingle();

  if (!auctionRun) {
    return null;
  }

  const { data: candidates } = await supabase
    .from("auction_candidates")
    .select("*")
    .eq("auction_run_id", auctionRun.id)
    .order("rank", { ascending: true });

  return {
    auction_run: auctionRun,
    candidates: (candidates || []).map((c) => ({
      campaign_id: c.campaign_id,
      eligible: c.eligible,
      bid_cents: c.bid_cents,
      bid_type: c.rule_snapshot_json?.bid_type || "fixed",
      rank: c.rank,
      reason_code: c.reason_codes_json?.[0],
      weight: c.rule_snapshot_json?.weight ?? 1,
      priority: c.rule_snapshot_json?.priority ?? 0,
      remaining_capacity: c.rule_snapshot_json?.remaining_capacity ?? null,
    })),
  };
}
