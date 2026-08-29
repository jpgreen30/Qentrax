import type { SupabaseClient } from "@supabase/supabase-js";

export type ConversionStatus = "qualified" | "approved" | "rejected" | "pending" | "unknown";

export type ConversionEvent = {
  id: string;
  delivery_id: string;
  transaction_id: string;
  organization_id: string;
  conversion_status: ConversionStatus;
  conversion_value?: number; // For multi-value conversions (customer lifetime value, etc.)
  conversion_date: string;
  event_type: "lead_qualified" | "appointment" | "sale" | "application" | "custom";
  event_metadata?: Record<string, unknown>;
  external_conversion_id?: string;
  created_at: string;
  updated_at: string;
};

export type FunnelMetrics = {
  vertical_id: string;
  total_pings: number;
  total_deliveries: number;
  total_conversions: number;
  conversion_rate: number; // conversions / deliveries
  average_value: number;
  period_start: string;
  period_end: string;
};

export type CampaignMetrics = {
  campaign_id: string;
  total_deliveries: number;
  total_conversions: number;
  conversion_rate: number;
  total_spend: number;
  total_revenue: number;
  cpa: number; // Cost Per Acquisition = spend / conversions
  roas: number; // Return On Ad Spend = revenue / spend
  aov: number; // Average Order Value = revenue / conversions
};

export type ConnectorMetrics = {
  connector_id: string;
  total_deliveries: number;
  total_conversions: number;
  conversion_rate: number;
  total_spend: number;
  total_revenue: number;
  cpa: number;
  roas: number;
  quality_score: number; // (conversion_rate + inverse_cpa_rank) / 2
};

export async function recordConversionEvent(
  supabase: SupabaseClient,
  organizationId: string,
  deliveryId: string,
  transactionId: string,
  status: ConversionStatus,
  options?: {
    conversionValue?: number;
    eventType?: ConversionEvent["event_type"];
    eventMetadata?: Record<string, unknown>;
    externalConversionId?: string;
  }
): Promise<ConversionEvent> {
  const newEvent: ConversionEvent = {
    id: crypto.randomUUID(),
    delivery_id: deliveryId,
    transaction_id: transactionId,
    organization_id: organizationId,
    conversion_status: status,
    conversion_value: options?.conversionValue,
    conversion_date: new Date().toISOString(),
    event_type: options?.eventType || "lead_qualified",
    event_metadata: options?.eventMetadata,
    external_conversion_id: options?.externalConversionId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error, data } = await supabase
    .from("conversion_events")
    .insert([newEvent])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to record conversion event: ${error.message}`);
  }

  // Update transaction status based on conversion
  await supabase
    .from("transactions")
    .update({
      status: status === "qualified" ? "charged" : status === "rejected" ? "failed" : "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", transactionId);

  return data;
}

export async function getConversionsByDelivery(
  supabase: SupabaseClient,
  deliveryId: string
): Promise<ConversionEvent[]> {
  const { data, error } = await supabase
    .from("conversion_events")
    .select("*")
    .eq("delivery_id", deliveryId);

  if (error) {
    throw new Error(`Failed to get conversions: ${error.message}`);
  }

  return data || [];
}

export async function getFunnelMetrics(
  supabase: SupabaseClient,
  organizationId: string,
  verticalId: string,
  startDate: string,
  endDate: string
): Promise<FunnelMetrics> {
  // Get delivery count
  const { data: deliveries, error: deliveriesError } = await supabase
    .from("deliveries")
    .select("id")
    .eq("organization_id", organizationId)
    .gte("created_at", startDate)
    .lte("created_at", endDate);

  if (deliveriesError) {
    throw new Error(`Failed to get deliveries: ${deliveriesError.message}`);
  }

  const deliveryIds = (deliveries || []).map((d) => d.id);
  const totalDeliveries = deliveryIds.length;

  // Get conversion count
  const { data: conversions, error: conversionsError } = await supabase
    .from("conversion_events")
    .select("id, conversion_value")
    .eq("organization_id", organizationId)
    .in("delivery_id", deliveryIds.length > 0 ? deliveryIds : [""])
    .eq("conversion_status", "qualified")
    .gte("created_at", startDate)
    .lte("created_at", endDate);

  if (conversionsError) {
    throw new Error(`Failed to get conversions: ${conversionsError.message}`);
  }

  const totalConversions = (conversions || []).length;
  const totalValue = (conversions || []).reduce(
    (sum, c) => sum + (c.conversion_value || 0),
    0
  );

  return {
    vertical_id: verticalId,
    total_pings: deliveryIds.length, // Approximation
    total_deliveries: totalDeliveries,
    total_conversions: totalConversions,
    conversion_rate: totalDeliveries > 0 ? totalConversions / totalDeliveries : 0,
    average_value: totalConversions > 0 ? totalValue / totalConversions : 0,
    period_start: startDate,
    period_end: endDate,
  };
}

export async function getCampaignMetrics(
  supabase: SupabaseClient,
  organizationId: string,
  campaignId: string,
  startDate: string,
  endDate: string
): Promise<CampaignMetrics> {
  // Get auction records for campaign
  const { data: auctions, error: auctionsError } = await supabase
    .from("auction_logs")
    .select("id, transaction_id")
    .eq("organization_id", organizationId)
    .eq("winner_campaign_id", campaignId)
    .gte("created_at", startDate)
    .lte("created_at", endDate);

  if (auctionsError) {
    throw new Error(`Failed to get auctions: ${auctionsError.message}`);
  }

  const transactionIds = (auctions || []).map((a) => a.transaction_id);
  const totalDeliveries = transactionIds.length;

  // Get conversion count and value
  const { data: conversions, error: conversionsError } = await supabase
    .from("conversion_events")
    .select("id, conversion_value")
    .eq("organization_id", organizationId)
    .in("transaction_id", transactionIds.length > 0 ? transactionIds : [""])
    .eq("conversion_status", "qualified");

  if (conversionsError) {
    throw new Error(`Failed to get conversions: ${conversionsError.message}`);
  }

  const totalConversions = (conversions || []).length;
  const totalRevenue = (conversions || []).reduce(
    (sum, c) => sum + (c.conversion_value || 0),
    0
  );

  // Get transaction spend
  const { data: transactions, error: transactionsError } = await supabase
    .from("transactions")
    .select("bid_amount")
    .eq("organization_id", organizationId)
    .in("id", transactionIds.length > 0 ? transactionIds : [""]);

  if (transactionsError) {
    throw new Error(`Failed to get transactions: ${transactionsError.message}`);
  }

  const totalSpend = (transactions || []).reduce((sum, t) => sum + (t.bid_amount || 0), 0);

  return {
    campaign_id: campaignId,
    total_deliveries: totalDeliveries,
    total_conversions: totalConversions,
    conversion_rate: totalDeliveries > 0 ? totalConversions / totalDeliveries : 0,
    total_spend: totalSpend,
    total_revenue: totalRevenue,
    cpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
    roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    aov: totalConversions > 0 ? totalRevenue / totalConversions : 0,
  };
}

export async function getConnectorMetrics(
  supabase: SupabaseClient,
  organizationId: string,
  connectorId: string,
  startDate: string,
  endDate: string
): Promise<ConnectorMetrics> {
  // Get deliveries from this connector
  const { data: deliveries, error: deliveriesError } = await supabase
    .from("deliveries")
    .select("id, transaction_id, bid_amount")
    .eq("organization_id", organizationId)
    .eq("connector_id", connectorId)
    .gte("created_at", startDate)
    .lte("created_at", endDate);

  if (deliveriesError) {
    throw new Error(`Failed to get deliveries: ${deliveriesError.message}`);
  }

  const deliveryIds = (deliveries || []).map((d) => d.id);
  const totalDeliveries = deliveryIds.length;
  const totalSpend = (deliveries || []).reduce((sum, d) => sum + (d.bid_amount || 0), 0);

  // Get conversions
  const { data: conversions, error: conversionsError } = await supabase
    .from("conversion_events")
    .select("id, conversion_value")
    .eq("organization_id", organizationId)
    .in("delivery_id", deliveryIds.length > 0 ? deliveryIds : [""])
    .eq("conversion_status", "qualified");

  if (conversionsError) {
    throw new Error(`Failed to get conversions: ${conversionsError.message}`);
  }

  const totalConversions = (conversions || []).length;
  const totalRevenue = (conversions || []).reduce(
    (sum, c) => sum + (c.conversion_value || 0),
    0
  );

  const conversionRate = totalDeliveries > 0 ? totalConversions / totalDeliveries : 0;
  const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  // Quality score combines conversion rate and CPA efficiency
  // Normalize: conversion_rate (0-1) + (1 - normalized_cpa)
  const maxCpa = 1000; // Normalization reference
  const normalizedCpa = Math.min(cpa / maxCpa, 1);
  const qualityScore = (conversionRate + (1 - normalizedCpa)) / 2;

  return {
    connector_id: connectorId,
    total_deliveries: totalDeliveries,
    total_conversions: totalConversions,
    conversion_rate: conversionRate,
    total_spend: totalSpend,
    total_revenue: totalRevenue,
    cpa,
    roas,
    quality_score: qualityScore,
  };
}

export async function getOrganizationMetrics(
  supabase: SupabaseClient,
  organizationId: string,
  startDate: string,
  endDate: string
): Promise<{
  total_pings: number;
  total_deliveries: number;
  total_conversions: number;
  overall_conversion_rate: number;
  total_spend: number;
  total_revenue: number;
  overall_roas: number;
}> {
  // Get all deliveries for org
  const { data: deliveries, error: deliveriesError } = await supabase
    .from("deliveries")
    .select("id, bid_amount")
    .eq("organization_id", organizationId)
    .gte("created_at", startDate)
    .lte("created_at", endDate);

  if (deliveriesError) {
    throw new Error(`Failed to get deliveries: ${deliveriesError.message}`);
  }

  const deliveryIds = (deliveries || []).map((d) => d.id);
  const totalDeliveries = deliveryIds.length;
  const totalSpend = (deliveries || []).reduce((sum, d) => sum + (d.bid_amount || 0), 0);

  // Get conversions
  const { data: conversions, error: conversionsError } = await supabase
    .from("conversion_events")
    .select("id, conversion_value")
    .eq("organization_id", organizationId)
    .in("delivery_id", deliveryIds.length > 0 ? deliveryIds : [""])
    .eq("conversion_status", "qualified");

  if (conversionsError) {
    throw new Error(`Failed to get conversions: ${conversionsError.message}`);
  }

  const totalConversions = (conversions || []).length;
  const totalRevenue = (conversions || []).reduce(
    (sum, c) => sum + (c.conversion_value || 0),
    0
  );

  return {
    total_pings: totalDeliveries, // Approximation
    total_deliveries: totalDeliveries,
    total_conversions: totalConversions,
    overall_conversion_rate: totalDeliveries > 0 ? totalConversions / totalDeliveries : 0,
    total_spend: totalSpend,
    total_revenue: totalRevenue,
    overall_roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
  };
}

export async function bulkRecordConversions(
  supabase: SupabaseClient,
  organizationId: string,
  events: Array<{
    deliveryId: string;
    transactionId: string;
    status: ConversionStatus;
    conversionValue?: number;
    eventType?: ConversionEvent["event_type"];
    externalConversionId?: string;
  }>
): Promise<ConversionEvent[]> {
  const conversions = events.map((e) => ({
    id: crypto.randomUUID(),
    delivery_id: e.deliveryId,
    transaction_id: e.transactionId,
    organization_id: organizationId,
    conversion_status: e.status,
    conversion_value: e.conversionValue,
    conversion_date: new Date().toISOString(),
    event_type: e.eventType || "lead_qualified",
    external_conversion_id: e.externalConversionId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const { error, data } = await supabase
    .from("conversion_events")
    .insert(conversions)
    .select();

  if (error) {
    throw new Error(`Failed to record conversions: ${error.message}`);
  }

  return data || [];
}
