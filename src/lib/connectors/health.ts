import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectorHealthStatus } from "./types";

export type HealthCheckInput = {
  connector_id: string;
  organization_id: string;
  latency_ms: number;
  success: boolean;
  error?: string;
};

class ConnectorHealth {
  private inMemoryStats: Map<string, ConnectorHealthStatus> = new Map();

  async recordCheck(
    supabase: SupabaseClient,
    input: HealthCheckInput,
  ): Promise<ConnectorHealthStatus> {
    const {
      connector_id,
      organization_id,
      latency_ms,
      success,
      error,
    } = input;

    const keyId = `${organization_id}:${connector_id}`;

    // Update in-memory stats
    const stats = this.inMemoryStats.get(keyId) || this.initializeStats(connector_id);

    if (success) {
      stats.consecutive_failures = 0;
      stats.last_successful_at = new Date().toISOString();
    } else {
      stats.consecutive_failures += 1;
      stats.last_error = error || "Unknown error";
    }

    // Update error rate (rolling window: last 100 checks)
    const checkCount = Math.max(
      1,
      (stats.error_rate === 0 ? 100 : Math.round(100 / (1 - stats.error_rate))),
    );
    const failureCount = Math.round(stats.error_rate * checkCount);
    const newFailureCount = success ? failureCount : failureCount + 1;
    stats.error_rate = newFailureCount / (checkCount + 1);

    // Update average latency (exponential moving average)
    stats.avg_latency_ms = stats.avg_latency_ms * 0.8 + latency_ms * 0.2;

    // Update status based on metrics
    if (stats.consecutive_failures > 5 || stats.error_rate > 0.5) {
      stats.status = "unhealthy";
    } else if (stats.consecutive_failures > 2 || stats.error_rate > 0.2) {
      stats.status = "degraded";
    } else {
      stats.status = "healthy";
    }

    stats.last_check_at = new Date().toISOString();
    this.inMemoryStats.set(keyId, stats);

    // Persist to database
    await this.persistHealth(supabase, organization_id, stats);

    return stats;
  }

  async getHealth(
    supabase: SupabaseClient,
    connector_id: string,
    organization_id: string,
  ): Promise<ConnectorHealthStatus | null> {
    const { data, error } = await supabase
      .from("connector_health_checks")
      .select("*")
      .eq("connector_id", connector_id)
      .eq("organization_id", organization_id)
      .order("last_check_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      const keyId = `${organization_id}:${connector_id}`;
      return this.inMemoryStats.get(keyId) || null;
    }

    return data as ConnectorHealthStatus;
  }

  async isConnectorHealthy(
    supabase: SupabaseClient,
    connector_id: string,
    organization_id: string,
  ): Promise<boolean> {
    const health = await this.getHealth(supabase, connector_id, organization_id);
    return health ? health.status !== "unhealthy" : true;
  }

  private async persistHealth(
    supabase: SupabaseClient,
    organization_id: string,
    stats: ConnectorHealthStatus,
  ): Promise<void> {
    const payload = {
      connector_id: stats.connector_id,
      organization_id,
      status: stats.status,
      last_check_at: stats.last_check_at,
      last_successful_at: stats.last_successful_at || null,
      consecutive_failures: stats.consecutive_failures,
      error_rate: stats.error_rate,
      avg_latency_ms: stats.avg_latency_ms,
      last_error: stats.last_error || null,
    };

    await supabase
      .from("connector_health_checks")
      .upsert(payload, { onConflict: "connector_id,organization_id" });
  }

  private initializeStats(connector_id: string): ConnectorHealthStatus {
    return {
      connector_id,
      status: "healthy",
      last_check_at: new Date().toISOString(),
      consecutive_failures: 0,
      error_rate: 0,
      avg_latency_ms: 0,
    };
  }
}

export const connectorHealth = new ConnectorHealth();
