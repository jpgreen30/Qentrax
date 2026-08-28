import type { SupabaseClient } from "@supabase/supabase-js";
import type { PingRequest, ConnectorResponse, PingResponse } from "./types";
import { pingConnector } from "./executor";
import { connectorRegistry } from "./registry";
import { connectorHealth } from "./health";

export type MixedAuctionInput = {
  source_id: string;
  external_submission_id: string;
  vertical_id: string;
  organization_id: string;
  request: PingRequest;
};

export type MixedAuctionCandidate = {
  type: "native" | "external";
  campaign_id?: string;
  connector_id?: string;
  connector_name?: string;
  bid_cents: number;
  bid_type: string;
  status: "accepted" | "rejected" | "review";
  reason_code?: string;
  latency_ms: number;
};

export type MixedAuctionResult = {
  winner_type: "native" | "external";
  winner_id: string;
  winning_bid_cents: number;
  candidates: MixedAuctionCandidate[];
  native_count: number;
  external_count: number;
  total_latency_ms: number;
};

async function runMixedAuction(
  supabase: SupabaseClient,
  input: MixedAuctionInput,
): Promise<MixedAuctionResult> {
  const startTime = Date.now();
  const candidates: MixedAuctionCandidate[] = [];

  // Load connectors for this vertical (would come from native routing engine)
  // For now, mock the native candidates response
  const nativeCandidates: MixedAuctionCandidate[] = []; // Would come from Phase 1 routing

  // Parallel fetch from external connectors
  const connectors = await connectorRegistry.getConnectorsForVertical(
    supabase,
    input.organization_id,
    input.vertical_id,
  );

  const externalPromises = connectors.map(async (config) => {
    try {
      const isHealthy = await connectorHealth.isConnectorHealthy(
        supabase,
        config.id,
        input.organization_id,
      );
      if (!isHealthy) {
        return null;
      }

      const startConnectorTime = Date.now();
      const response = await pingConnector(config, input.request);
      const latency = Date.now() - startConnectorTime;

      // Record health check
      await connectorHealth.recordCheck(supabase, {
        connector_id: config.id,
        organization_id: input.organization_id,
        latency_ms: latency,
        success: response.success,
        error: response.error_message,
      });

      if (!response.success || !response.response) {
        return null;
      }

      const result = response.response;
      return {
        type: "external" as const,
        connector_id: config.id,
        connector_name: config.name,
        bid_cents: result.bid_cents || 0,
        bid_type: result.bid_type || "fixed",
        status: result.status,
        reason_code: result.reason_code,
        latency_ms: latency,
      };
    } catch (error) {
      await connectorHealth.recordCheck(supabase, {
        connector_id: config.id,
        organization_id: input.organization_id,
        latency_ms: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  });

  const externalResults = await Promise.all(externalPromises);
  const externalCandidates = externalResults.filter(
    (r): r is Exclude<typeof r, null> => r !== null,
  );

  // Combine all candidates
  candidates.push(...nativeCandidates, ...externalCandidates);

  // Sort by bid (highest first)
  candidates.sort((a, b) => b.bid_cents - a.bid_cents);

  // Select winner
  const winner = candidates[0];
  const totalLatency = Date.now() - startTime;

  if (!winner || winner.bid_cents <= 0) {
    return {
      winner_type: "native",
      winner_id: "",
      winning_bid_cents: 0,
      candidates,
      native_count: nativeCandidates.length,
      external_count: externalCandidates.length,
      total_latency_ms: totalLatency,
    };
  }

  return {
    winner_type: winner.type,
    winner_id: winner.campaign_id || winner.connector_id || "",
    winning_bid_cents: winner.bid_cents,
    candidates,
    native_count: nativeCandidates.length,
    external_count: externalCandidates.length,
    total_latency_ms: totalLatency,
  };
}

export { runMixedAuction };
