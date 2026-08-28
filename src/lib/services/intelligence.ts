import type { SupabaseClient } from "@supabase/supabase-js";

export type Anomaly = {
  id: string;
  organization_id: string;
  anomaly_type: "bid_pattern" | "performance_drop" | "conversion_rate" | "revenue_spike" | "campaign_churn";
  severity: "low" | "medium" | "high" | "critical";
  entity_type: "campaign" | "vertical" | "product" | "source" | "connector";
  entity_id: string;
  metric_name: string;
  expected_value: number;
  actual_value: number;
  deviation_percent: number;
  evidence: string;
  detection_date: string;
  resolution_status: "open" | "acknowledged" | "investigating" | "resolved";
  created_at: string;
  updated_at: string;
};

export type OptimizationRecommendation = {
  id: string;
  organization_id: string;
  recommendation_type: "bid_optimization" | "budget_allocation" | "strategy_change" | "pause_campaign" | "scale_campaign" | "geographic_expansion";
  priority: "low" | "medium" | "high" | "critical";
  target_entity: string;
  target_entity_type: "campaign" | "vertical" | "product" | "source";
  current_value: number;
  recommended_value: number;
  expected_impact: number; // % improvement in revenue
  confidence_score: number; // 0-1
  reasoning: string;
  implementation_steps?: string[];
  risks?: string[];
  estimated_ramp_time_days?: number;
  created_at: string;
  updated_at: string;
};

export type Prediction = {
  id: string;
  organization_id: string;
  prediction_type: "lead_quality" | "conversion_probability" | "revenue_forecast" | "campaign_performance" | "advertiser_churn" | "publisher_churn";
  entity_id: string;
  entity_type: string;
  prediction_value: number; // 0-1 for probabilities, actual value for forecasts
  confidence_interval: { lower: number; upper: number };
  time_horizon_days: number;
  input_features: Record<string, number>;
  model_version: string;
  created_at: string;
  expires_at: string;
};

export type IntelligenceReport = {
  organization_id: string;
  report_date: string;
  period_start: string;
  period_end: string;
  anomalies: Anomaly[];
  critical_anomalies_count: number;
  recommendations: OptimizationRecommendation[];
  top_opportunities: Array<{ recommendation_id: string; expected_impact: number }>;
  predictions: {
    lead_quality: Prediction[];
    conversion_forecast: Prediction[];
    revenue_forecast: Prediction[];
    churn_risk: Prediction[];
  };
  health_score: number; // 0-100
  trend_analysis: TrendAnalysis;
};

export type TrendAnalysis = {
  bid_trends: "increasing" | "decreasing" | "stable";
  conversion_trends: "improving" | "declining" | "stable";
  revenue_trends: "growing" | "declining" | "stable";
  market_concentration: number; // 0-1, higher = more concentrated
  competitor_activity: "increasing" | "decreasing" | "stable";
};

export async function detectAnomalies(
  supabase: SupabaseClient,
  organizationId: string,
  lookbackDays: number = 7
): Promise<Anomaly[]> {
  // Fetch historical metrics
  const { data: auctions, error: auctionError } = await supabase
    .from("auction_logs")
    .select("id, winner_campaign_id, bid_amount, created_at")
    .eq("organization_id", organizationId)
    .gte("created_at", new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString());

  if (auctionError || !auctions) {
    throw new Error(`Failed to fetch auction logs: ${auctionError?.message}`);
  }

  const anomalies: Anomaly[] = [];

  // Detect bid pattern anomalies
  const bidsByDay: Record<string, number[]> = {};
  for (const auction of auctions) {
    const day = new Date(auction.created_at).toISOString().split("T")[0];
    if (!bidsByDay[day]) bidsByDay[day] = [];
    bidsByDay[day].push(auction.bid_amount || 0);
  }

  // Calculate daily bid statistics
  const dailyStats = Object.entries(bidsByDay).map(([day, bids]) => {
    const avg = bids.reduce((a, b) => a + b, 0) / bids.length;
    const stdDev = Math.sqrt(bids.reduce((sum, bid) => sum + Math.pow(bid - avg, 2), 0) / bids.length);
    return { day, avg, stdDev, count: bids.length };
  });

  // Detect significant deviations
  if (dailyStats.length > 1) {
    const recentStats = dailyStats[dailyStats.length - 1];
    const avgPrevious = dailyStats.slice(0, -1).reduce((sum, s) => sum + s.avg, 0) / (dailyStats.length - 1);

    if (Math.abs(recentStats.avg - avgPrevious) > avgPrevious * 0.2) {
      anomalies.push({
        id: crypto.randomUUID(),
        organization_id: organizationId,
        anomaly_type: "bid_pattern",
        severity: Math.abs(recentStats.avg - avgPrevious) > avgPrevious * 0.5 ? "high" : "medium",
        entity_type: "campaign",
        entity_id: "all",
        metric_name: "average_bid",
        expected_value: avgPrevious,
        actual_value: recentStats.avg,
        deviation_percent: ((recentStats.avg - avgPrevious) / avgPrevious) * 100,
        evidence: `Average bid changed from ${avgPrevious.toFixed(2)} to ${recentStats.avg.toFixed(2)} on ${recentStats.day}`,
        detection_date: new Date().toISOString(),
        resolution_status: "open",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  // Detect conversion rate anomalies (if data available)
  const { data: conversions, error: convError } = await supabase
    .from("conversion_events")
    .select("id, delivery_id")
    .eq("organization_id", organizationId)
    .eq("conversion_status", "qualified")
    .gte("created_at", new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString());

  if (!convError && conversions) {
    const totalDeliveries = auctions.length;
    const totalConversions = conversions.length;
    const conversionRate = totalDeliveries > 0 ? totalConversions / totalDeliveries : 0;

    // Simple check: if conversion rate is extremely low or high
    if (conversionRate < 0.001 && totalDeliveries > 100) {
      anomalies.push({
        id: crypto.randomUUID(),
        organization_id: organizationId,
        anomaly_type: "conversion_rate",
        severity: "high",
        entity_type: "vertical",
        entity_id: "all",
        metric_name: "conversion_rate",
        expected_value: 0.01,
        actual_value: conversionRate,
        deviation_percent: ((conversionRate - 0.01) / 0.01) * 100,
        evidence: `Conversion rate unusually low: ${(conversionRate * 100).toFixed(3)}%`,
        detection_date: new Date().toISOString(),
        resolution_status: "open",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  return anomalies;
}

export async function generateOptimizationRecommendations(
  supabase: SupabaseClient,
  organizationId: string,
  anomalies: Anomaly[]
): Promise<OptimizationRecommendation[]> {
  const recommendations: OptimizationRecommendation[] = [];

  // Fetch campaign data for optimization
  const { data: campaigns, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, name, bid_amount, daily_cap, monthly_cap, status")
    .eq("organization_id", organizationId)
    .eq("status", "active");

  if (campaignError || !campaigns) {
    throw new Error(`Failed to fetch campaigns: ${campaignError?.message}`);
  }

  // Filter anomalies to only those with supported entity types for recommendations
  const supportedEntityTypes = ["campaign", "vertical", "product", "source"];
  const relevantAnomalies = anomalies.filter((a) =>
    supportedEntityTypes.includes(a.entity_type)
  );

  // Based on anomalies, generate recommendations
  for (const anomaly of relevantAnomalies) {
    if (anomaly.anomaly_type === "bid_pattern" && anomaly.deviation_percent > 20) {
      // Recommend bid adjustment
      const campaign = campaigns[0]; // Simplified
      if (campaign) {
        recommendations.push({
          id: crypto.randomUUID(),
          organization_id: organizationId,
          recommendation_type: "bid_optimization",
          priority: anomaly.severity === "critical" ? "critical" : anomaly.severity === "high" ? "high" : "medium",
          target_entity: campaign.id,
          target_entity_type: "campaign",
          current_value: campaign.bid_amount || 0,
          recommended_value: (campaign.bid_amount || 0) * (1 + anomaly.deviation_percent / 100),
          expected_impact: Math.abs(anomaly.deviation_percent) * 0.5, // Conservative estimate
          confidence_score: 0.75,
          reasoning: `Bid pattern anomaly detected. ${anomaly.evidence}. Consider adjusting bid to align with market trends.`,
          implementation_steps: [
            "Review current bid performance",
            "Test new bid amount on subset of traffic",
            "Monitor conversion rate impact",
            "Scale gradually if positive results",
          ],
          risks: ["Reduced volume if bid lowered", "Increased CPA if bid raised"],
          estimated_ramp_time_days: 3,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (anomaly.anomaly_type === "conversion_rate" && anomaly.severity === "high") {
      recommendations.push({
        id: crypto.randomUUID(),
        organization_id: organizationId,
        recommendation_type: "strategy_change",
        priority: "high",
        target_entity: anomaly.entity_id,
        target_entity_type: anomaly.entity_type as "campaign" | "vertical" | "product" | "source",
        current_value: anomaly.actual_value,
        recommended_value: 0.01, // Target 1% conversion
        expected_impact: 50, // Significant improvement potential
        confidence_score: 0.65,
        reasoning: `Low conversion rate detected for ${anomaly.entity_type}. Consider testing alternative routing strategies or improving lead quality filtering.`,
        implementation_steps: [
          "Analyze low-converting lead characteristics",
          "Test stricter qualification rules",
          "Try different routing strategies",
          "Review partner feedback",
        ],
        risks: ["Reduced volume from stricter rules", "Need for A/B testing period"],
        estimated_ramp_time_days: 7,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  // Generate optimization recommendations based on performance
  const { data: metrics, error: metricsError } = await supabase
    .from("campaign_roi_metrics")
    .select("campaign_id, roas, cpa, conversion_rate")
    .eq("organization_id", organizationId)
    .order("roas", { ascending: false })
    .limit(10);

  if (!metricsError && metrics && metrics.length > 0) {
    const topPerformer = metrics[0];
    if (topPerformer.roas > 2) {
      // Scale successful campaign
      const campaign = campaigns.find((c) => c.id === topPerformer.campaign_id);
      if (campaign) {
        recommendations.push({
          id: crypto.randomUUID(),
          organization_id: organizationId,
          recommendation_type: "scale_campaign",
          priority: "high",
          target_entity: campaign.id,
          target_entity_type: "campaign",
          current_value: campaign.daily_cap || 0,
          recommended_value: (campaign.daily_cap || 0) * 1.5,
          expected_impact: 30, // 30% potential volume increase
          confidence_score: 0.85,
          reasoning: `Campaign ${campaign.name} showing excellent ROAS (${topPerformer.roas.toFixed(2)}). Budget capacity available to increase daily cap.`,
          implementation_steps: [
            "Increase daily cap by 25-50%",
            "Monitor volume and ROAS closely",
            "Scale incrementally over 3-5 days",
          ],
          risks: ["Inventory constraints", "Possible quality degradation at scale"],
          estimated_ramp_time_days: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  return recommendations;
}

export async function predictLeadQuality(
  supabase: SupabaseClient,
  organizationId: string,
  leadData: Record<string, unknown>
): Promise<Prediction> {
  // Simplified ML prediction (in production, would call ML model service)
  const features = {
    vertical_id: leadData.vertical_id ? 1 : 0,
    product_id: leadData.product_id ? 1 : 0,
    lead_value: (leadData.lead_value as number) || 0,
    source_quality: (leadData.source_quality as number) || 0.5,
  };

  // Simple heuristic scoring
  const baseScore = 0.5;
  const valueBoost = Math.min(features.lead_value / 1000, 0.3);
  const sourceBoost = features.source_quality * 0.2;
  const qualityScore = Math.min(baseScore + valueBoost + sourceBoost, 1);

  return {
    id: crypto.randomUUID(),
    organization_id: organizationId,
    prediction_type: "lead_quality",
    entity_id: "new_lead",
    entity_type: "lead",
    prediction_value: qualityScore,
    confidence_interval: {
      lower: Math.max(qualityScore - 0.15, 0),
      upper: Math.min(qualityScore + 0.15, 1),
    },
    time_horizon_days: 0,
    input_features: features,
    model_version: "v1.0",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function forecastRevenue(
  supabase: SupabaseClient,
  organizationId: string,
  forecastDays: number = 30
): Promise<Prediction> {
  // Fetch recent revenue data
  const { data: auctions, error } = await supabase
    .from("auction_logs")
    .select("bid_amount, created_at")
    .eq("organization_id", organizationId)
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  if (error || !auctions) {
    throw new Error(`Failed to fetch auction data: ${error?.message}`);
  }

  // Calculate daily average revenue
  const dailyRevenue: Record<string, number> = {};
  for (const auction of auctions) {
    const day = new Date(auction.created_at).toISOString().split("T")[0];
    dailyRevenue[day] = (dailyRevenue[day] || 0) + (auction.bid_amount || 0);
  }

  const revenueValues = Object.values(dailyRevenue);
  const avgDaily = revenueValues.length > 0 ? revenueValues.reduce((a, b) => a + b, 0) / revenueValues.length : 0;

  // Simple trend calculation (linear extrapolation)
  const recentDays = revenueValues.slice(-7);
  const trend = recentDays.length > 1 ? (recentDays[recentDays.length - 1] - recentDays[0]) / recentDays.length : 0;

  const forecastedRevenue = Math.max(0, avgDaily * forecastDays + trend * forecastDays * (forecastDays / 2));
  const confidence = Math.max(0.6, Math.min(0.9, revenueValues.length / 30)); // More data = higher confidence

  return {
    id: crypto.randomUUID(),
    organization_id: organizationId,
    prediction_type: "revenue_forecast",
    entity_id: "organization",
    entity_type: "organization",
    prediction_value: forecastedRevenue,
    confidence_interval: {
      lower: Math.max(0, forecastedRevenue * 0.8),
      upper: forecastedRevenue * 1.2,
    },
    time_horizon_days: forecastDays,
    input_features: {
      avg_daily_revenue: avgDaily,
      recent_trend: trend,
      data_points: revenueValues.length,
    },
    model_version: "v1.0",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + forecastDays * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function predictChurnRisk(
  supabase: SupabaseClient,
  organizationId: string,
  entityType: "advertiser" | "publisher",
  entityId: string
): Promise<Prediction> {
  // Fetch recent activity for the specific entity
  const { data: recentOrders, error } = await supabase
    .from(entityType === "advertiser" ? "campaigns" : "opportunities")
    .select("id, updated_at, status")
    .eq("organization_id", organizationId)
    .eq("id", entityId)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error || !recentOrders) {
    throw new Error("Failed to fetch recent activity");
  }

  // Simple churn risk calculation
  const daysSinceLastActivity = recentOrders.length > 0
    ? Math.floor((Date.now() - new Date(recentOrders[0].updated_at).getTime()) / (24 * 60 * 60 * 1000))
    : 30;

  const inactivityRisk = Math.min(daysSinceLastActivity / 60, 1); // Max risk at 60 days
  const statusRisk = recentOrders.some((o) => o.status === "active") ? 0.1 : 0.5;
  const churnRisk = Math.min(inactivityRisk * 0.7 + statusRisk * 0.3, 1);

  return {
    id: crypto.randomUUID(),
    organization_id: organizationId,
    prediction_type: entityType === "advertiser" ? "advertiser_churn" : "publisher_churn",
    entity_id: entityId,
    entity_type: entityType,
    prediction_value: churnRisk,
    confidence_interval: {
      lower: Math.max(churnRisk - 0.2, 0),
      upper: Math.min(churnRisk + 0.2, 1),
    },
    time_horizon_days: 30,
    input_features: {
      days_since_activity: daysSinceLastActivity,
      active_campaigns: recentOrders.filter((o) => o.status === "active").length,
    },
    model_version: "v1.0",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function generateIntelligenceReport(
  supabase: SupabaseClient,
  organizationId: string,
  lookbackDays: number = 30
): Promise<IntelligenceReport> {
  const reportDate = new Date().toISOString();
  const periodStart = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const periodEnd = reportDate;

  // Detect anomalies
  const anomalies = await detectAnomalies(supabase, organizationId, lookbackDays);
  const criticalAnomalies = anomalies.filter((a) => a.severity === "critical").length;

  // Generate recommendations
  const recommendations = await generateOptimizationRecommendations(supabase, organizationId, anomalies);

  // Generate predictions
  const predictions = {
    lead_quality: [],
    conversion_forecast: [],
    revenue_forecast: [await forecastRevenue(supabase, organizationId, 30)],
    churn_risk: [],
  };

  // Calculate health score (0-100)
  const healthScore = Math.max(0, 100 - anomalies.length * 10 - criticalAnomalies * 15);

  // Analyze trends (simplified)
  const trends: TrendAnalysis = {
    bid_trends: "stable",
    conversion_trends: "stable",
    revenue_trends: anomalies.some((a) => a.anomaly_type === "revenue_spike") ? "growing" : "stable",
    market_concentration: 0.5,
    competitor_activity: "stable",
  };

  return {
    organization_id: organizationId,
    report_date: reportDate,
    period_start: periodStart,
    period_end: periodEnd,
    anomalies,
    critical_anomalies_count: criticalAnomalies,
    recommendations,
    top_opportunities: recommendations
      .slice(0, 5)
      .map((r) => ({ recommendation_id: r.id, expected_impact: r.expected_impact })),
    predictions,
    health_score: healthScore,
    trend_analysis: trends,
  };
}
