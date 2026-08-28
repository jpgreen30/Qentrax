import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectorConfig, ConnectorStatus } from "./types";

export type RegistryQueryOptions = {
  organization_id?: string;
  connector_type?: string;
  status?: ConnectorStatus;
  vertical_id?: string;
};

class ConnectorRegistry {
  private cache: Map<string, ConnectorConfig> = new Map();
  private lastUpdated: Map<string, number> = new Map();
  private cacheTTL = 60000; // 60 seconds

  async getConnector(
    supabase: SupabaseClient,
    connector_id: string,
    orgId: string,
  ): Promise<ConnectorConfig | null> {
    // Check cache first
    const cached = this.cache.get(connector_id);
    const lastUpdate = this.lastUpdated.get(connector_id) || 0;
    if (cached && Date.now() - lastUpdate < this.cacheTTL) {
      return cached;
    }

    const { data, error } = await supabase
      .from("connectors")
      .select("*")
      .eq("id", connector_id)
      .eq("organization_id", orgId)
      .single();

    if (error || !data) return null;

    const config = data as ConnectorConfig;
    this.cache.set(connector_id, config);
    this.lastUpdated.set(connector_id, Date.now());
    return config;
  }

  async listConnectors(
    supabase: SupabaseClient,
    options: RegistryQueryOptions,
  ): Promise<ConnectorConfig[]> {
    let query = supabase.from("connectors").select("*");

    if (options.organization_id) {
      query = query.eq("organization_id", options.organization_id);
    }
    if (options.connector_type) {
      query = query.eq("connector_type", options.connector_type);
    }
    if (options.status) {
      query = query.eq("status", options.status);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data as ConnectorConfig[];
  }

  async getConnectorsForVertical(
    supabase: SupabaseClient,
    organization_id: string,
    vertical_id: string,
  ): Promise<ConnectorConfig[]> {
    const { data, error } = await supabase
      .from("connector_verticals")
      .select("connectors(*)")
      .eq("organization_id", organization_id)
      .eq("vertical_id", vertical_id)
      .eq("enabled", true);

    if (error || !data) return [];

    return data
      .map((row) => ((row as unknown) as { connectors: ConnectorConfig }).connectors)
      .filter(Boolean);
  }

  async getActiveConnectors(
    supabase: SupabaseClient,
    organization_id: string,
  ): Promise<ConnectorConfig[]> {
    return this.listConnectors(supabase, {
      organization_id,
      status: "active" as ConnectorStatus,
    });
  }

  invalidateCache(connector_id?: string): void {
    if (connector_id) {
      this.cache.delete(connector_id);
      this.lastUpdated.delete(connector_id);
    } else {
      this.cache.clear();
      this.lastUpdated.clear();
    }
  }
}

export const connectorRegistry = new ConnectorRegistry();
