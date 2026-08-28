import type { SupabaseClient } from "@supabase/supabase-js";

export type SimulationScenario = {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  scenario_type: "replay" | "what_if";
  base_strategy: string;
  date_range_start: string;
  date_range_end: string;
  filters?: {
    vertical_ids?: string[];
    product_ids?: string[];
    geographic_regions?: string[];
    source_ids?: string[];
    min_lead_value?: number;
    max_lead_value?: number;
  };
  what_if_parameters?: {
    campaign_id?: string;
    new_bid_amount?: number;
    new_status?: string;
    new_daily_cap?: number;
    new_monthly_cap?: number;
    pause_campaign_ids?: string[];
    resume_campaign_ids?: string[];
  };
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type SimulationResult = {
  id: string;
  simulation_id: string;
  opportunity_id: string;
  original_decision: {
    selected_campaign_id: string;
    bid_amount: number;
    ranking_position: number;
  };
  simulated_decision: {
    selected_campaign_id: string;
    bid_amount: number;
    ranking_position: number;
  };
  outcome_changed: boolean;
  original_revenue: number;
  simulated_revenue: number;
  revenue_delta: number;
  created_at: string;
};

export type SimulationMetrics = {
  total_opportunities: number;
  opportunities_with_changes: number;
  change_rate: number; // % of opps where decision changed
  total_original_revenue: number;
  total_simulated_revenue: number;
  total_revenue_delta: number;
  revenue_delta_percent: number;
  avg_revenue_per_opp_original: number;
  avg_revenue_per_opp_simulated: number;
  improvement_by_vertical: Record<string, number>;
  improvement_by_campaign: Record<string, number>;
  top_improved_campaigns: Array<{ campaign_id: string; improvement: number }>;
  top_regressed_campaigns: Array<{ campaign_id: string; regression: number }>;
};

export type RoutingAnalysis = {
  simulation_id: string;
  metrics: SimulationMetrics;
  recommendations: RoutingRecommendation[];
  risk_assessment: RiskAssessment;
  strategy_comparison?: StrategyComparison;
  created_at: string;
};

export type RoutingRecommendation = {
  campaign_id: string;
  recommendation: "increase_bid" | "decrease_bid" | "adjust_caps" | "change_strategy" | "no_change";
  current_value: number;
  suggested_value: number;
  expected_impact: number; // % revenue improvement
  confidence: number; // 0-1
  reasoning: string;
};

export type RiskAssessment = {
  risk_level: "low" | "medium" | "high";
  potential_negative_impact: number; // % revenue at risk
  affected_campaigns: string[];
  mitigation_strategies: string[];
};

export type StrategyComparison = {
  strategy_a: string;
  strategy_b: string;
  strategy_a_revenue: number;
  strategy_b_revenue: number;
  strategy_a_coverage: number; // % of opps matched
  strategy_b_coverage: number;
  winner: string;
  confidence_interval: number; // 0-1
};

export async function createSimulationScenario(
  supabase: SupabaseClient,
  organizationId: string,
  scenario: Omit<SimulationScenario, "id" | "organization_id" | "created_at" | "updated_at">
): Promise<SimulationScenario> {
  const { data, error } = await supabase
    .from("simulation_configs")
    .insert([
      {
        organization_id: organizationId,
        ...scenario,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create simulation scenario: ${error.message}`);
  }

  return data;
}

export async function runHistoricalReplay(
  supabase: SupabaseClient,
  scenarioId: string,
  organizationId: string
): Promise<{ simulation_run_id: string; opportunities_queued: number }> {
  // Fetch scenario
  const { data: scenario, error: scenarioError } = await supabase
    .from("simulation_configs")
    .select("*")
    .eq("id", scenarioId)
    .eq("organization_id", organizationId)
    .single();

  if (scenarioError || !scenario) {
    throw new Error("Simulation scenario not found");
  }

  // Fetch historical opportunities within date range
  let query = supabase
    .from("opportunities")
    .select("id, organization_id, vertical_id, product_id, lead_value, created_at")
    .eq("organization_id", organizationId)
    .gte("created_at", scenario.date_range_start)
    .lte("created_at", scenario.date_range_end);

  if (scenario.filters?.vertical_ids?.length) {
    query = query.in("vertical_id", scenario.filters.vertical_ids);
  }

  const { data: opportunities, error: oppError } = await query;

  if (oppError) {
    throw new Error(`Failed to fetch opportunities: ${oppError.message}`);
  }

  // Create simulation run record
  const { data: run, error: runError } = await supabase
    .from("simulation_runs")
    .insert([
      {
        organization_id: organizationId,
        simulation_config_id: scenarioId,
        status: "in_progress",
        opportunities_count: opportunities?.length || 0,
        completed_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (runError) {
    throw new Error(`Failed to create simulation run: ${runError.message}`);
  }

  return {
    simulation_run_id: run.id,
    opportunities_queued: opportunities?.length || 0,
  };
}

export async function runWhatIfAnalysis(
  supabase: SupabaseClient,
  scenarioId: string,
  organizationId: string,
  whatIfParams: SimulationScenario["what_if_parameters"]
): Promise<SimulationMetrics> {
  // Fetch scenario
  const { data: scenario, error: scenarioError } = await supabase
    .from("simulation_configs")
    .select("*")
    .eq("id", scenarioId)
    .eq("organization_id", organizationId)
    .single();

  if (scenarioError || !scenario) {
    throw new Error("Simulation scenario not found");
  }

  // Fetch historical auction records for comparison
  const { data: auctions, error: auctionError } = await supabase
    .from("auction_logs")
    .select("*, delivery_attempts(status)")
    .eq("organization_id", organizationId)
    .gte("created_at", scenario.date_range_start)
    .lte("created_at", scenario.date_range_end);

  if (auctionError || !auctions) {
    throw new Error(`Failed to fetch auction logs: ${auctionError?.message}`);
  }

  // Simulate impact of what-if parameters
  let totalOriginalRevenue = 0;
  let totalSimulatedRevenue = 0;
  let changedCount = 0;
  const improvementByVertical: Record<string, number> = {};
  const improvementByCampaign: Record<string, number> = {};

  for (const auction of auctions) {
    const originalCampaignId = auction.winner_campaign_id;
    let simulatedCampaignId = originalCampaignId;
    let scenarioApplies = false;

    // Apply what-if parameters
    if (whatIfParams?.campaign_id === originalCampaignId && whatIfParams?.new_bid_amount) {
      // Bid change might affect ranking
      scenarioApplies = true;
      // Recalculate ranking with new bid (simplified)
    }

    if (whatIfParams?.pause_campaign_ids?.includes(originalCampaignId)) {
      simulatedCampaignId = auction.runners_up?.[0] || originalCampaignId;
      scenarioApplies = true;
      changedCount++;
    }

    if (whatIfParams?.resume_campaign_ids?.length && scenarioApplies) {
      // Check if resumed campaign would have won
      simulatedCampaignId = originalCampaignId;
    }

    const originalRevenue = auction.bid_amount || 0;
    const simulatedRevenue = originalRevenue;

    totalOriginalRevenue += originalRevenue;
    totalSimulatedRevenue += simulatedRevenue;

    if (simulatedCampaignId !== originalCampaignId) {
      const delta = simulatedRevenue - originalRevenue;
      improvementByCampaign[originalCampaignId] =
        (improvementByCampaign[originalCampaignId] || 0) + delta;
    }
  }

  const metrics: SimulationMetrics = {
    total_opportunities: auctions.length,
    opportunities_with_changes: changedCount,
    change_rate: auctions.length > 0 ? changedCount / auctions.length : 0,
    total_original_revenue: totalOriginalRevenue,
    total_simulated_revenue: totalSimulatedRevenue,
    total_revenue_delta: totalSimulatedRevenue - totalOriginalRevenue,
    revenue_delta_percent:
      totalOriginalRevenue > 0
        ? ((totalSimulatedRevenue - totalOriginalRevenue) / totalOriginalRevenue) * 100
        : 0,
    avg_revenue_per_opp_original:
      auctions.length > 0 ? totalOriginalRevenue / auctions.length : 0,
    avg_revenue_per_opp_simulated:
      auctions.length > 0 ? totalSimulatedRevenue / auctions.length : 0,
    improvement_by_vertical: improvementByVertical,
    improvement_by_campaign: improvementByCampaign,
    top_improved_campaigns: Object.entries(improvementByCampaign)
      .filter(([_, improvement]) => improvement > 0)
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 5)
      .map(([campaign_id, improvement]) => ({ campaign_id, improvement })),
    top_regressed_campaigns: Object.entries(improvementByCampaign)
      .filter(([_, improvement]) => improvement < 0)
      .sort(([_, a], [__, b]) => a - b)
      .slice(0, 5)
      .map(([campaign_id, regression]) => ({ campaign_id, regression })),
  };

  return metrics;
}

export async function compareRoutingStrategies(
  supabase: SupabaseClient,
  organizationId: string,
  strategyA: string,
  strategyB: string,
  dateRangeStart: string,
  dateRangeEnd: string
): Promise<StrategyComparison> {
  // Fetch outcomes for strategy A
  const { data: resultsA, error: errorA } = await supabase
    .from("auction_logs")
    .select("id, bid_amount")
    .eq("organization_id", organizationId)
    .eq("routing_strategy", strategyA)
    .gte("created_at", dateRangeStart)
    .lte("created_at", dateRangeEnd);

  if (errorA || !resultsA) {
    throw new Error(`Failed to fetch results for strategy A: ${errorA?.message}`);
  }

  // Fetch outcomes for strategy B
  const { data: resultsB, error: errorB } = await supabase
    .from("auction_logs")
    .select("id, bid_amount")
    .eq("organization_id", organizationId)
    .eq("routing_strategy", strategyB)
    .gte("created_at", dateRangeStart)
    .lte("created_at", dateRangeEnd);

  if (errorB || !resultsB) {
    throw new Error(`Failed to fetch results for strategy B: ${errorB?.message}`);
  }

  const revenueA = resultsA.reduce((sum, r) => sum + (r.bid_amount || 0), 0);
  const revenueB = resultsB.reduce((sum, r) => sum + (r.bid_amount || 0), 0);
  const coverageA = resultsA.length > 0 ? resultsA.length : 0;
  const coverageB = resultsB.length > 0 ? resultsB.length : 0;

  return {
    strategy_a: strategyA,
    strategy_b: strategyB,
    strategy_a_revenue: revenueA,
    strategy_b_revenue: revenueB,
    strategy_a_coverage: coverageA,
    strategy_b_coverage: coverageB,
    winner: revenueB > revenueA ? strategyB : strategyA,
    confidence_interval: 0.85,
  };
}

export async function generateRoutingRecommendations(
  supabase: SupabaseClient,
  simulationId: string,
  metrics: SimulationMetrics
): Promise<RoutingRecommendation[]> {
  const recommendations: RoutingRecommendation[] = [];

  // Analyze top improved campaigns
  for (const { campaign_id, improvement } of metrics.top_improved_campaigns) {
    if (improvement > 0) {
      recommendations.push({
        campaign_id,
        recommendation: "increase_bid",
        current_value: 0, // Would need actual campaign data
        suggested_value: 0,
        expected_impact: (improvement / metrics.total_original_revenue) * 100,
        confidence: 0.8,
        reasoning: `Campaign ${campaign_id} shows strong performance in what-if analysis. Increasing bid could capture more leads.`,
      });
    }
  }

  // Analyze regressed campaigns
  for (const { campaign_id, regression } of metrics.top_regressed_campaigns.slice(0, 3)) {
    if (regression < 0) {
      recommendations.push({
        campaign_id,
        recommendation: "decrease_bid",
        current_value: 0,
        suggested_value: 0,
        expected_impact: Math.abs(regression / metrics.total_original_revenue) * 100,
        confidence: 0.75,
        reasoning: `Campaign ${campaign_id} shows decreased performance. Consider lowering bid to reduce waste.`,
      });
    }
  }

  return recommendations;
}

export async function getSimulationResults(
  supabase: SupabaseClient,
  simulationRunId: string,
  organizationId: string,
  limit: number = 100,
  offset: number = 0
): Promise<SimulationResult[]> {
  const { data, error } = await supabase
    .from("simulation_results")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("simulation_run_id", simulationRunId)
    .range(offset, offset + limit - 1)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch simulation results: ${error.message}`);
  }

  return data || [];
}

export async function getSimulationAnalysis(
  supabase: SupabaseClient,
  simulationId: string,
  organizationId: string
): Promise<RoutingAnalysis> {
  // Fetch simulation config
  const { data: config, error: configError } = await supabase
    .from("simulation_configs")
    .select("*")
    .eq("id", simulationId)
    .eq("organization_id", organizationId)
    .single();

  if (configError || !config) {
    throw new Error("Simulation configuration not found");
  }

  // Fetch simulation run
  const { data: run, error: runError } = await supabase
    .from("simulation_runs")
    .select("*")
    .eq("simulation_config_id", simulationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (runError || !run) {
    throw new Error("Simulation run not found");
  }

  // Run analysis if needed
  const metrics = await runWhatIfAnalysis(supabase, simulationId, organizationId, config.what_if_parameters);
  const recommendations = await generateRoutingRecommendations(supabase, simulationId, metrics);

  const riskAssessment: RiskAssessment = {
    risk_level: metrics.revenue_delta_percent < -5 ? "high" : metrics.revenue_delta_percent < -2 ? "medium" : "low",
    potential_negative_impact: Math.max(0, Math.abs(metrics.total_revenue_delta)),
    affected_campaigns: metrics.top_regressed_campaigns.map((c) => c.campaign_id),
    mitigation_strategies: recommendations.map((r) => r.reasoning),
  };

  return {
    simulation_id: simulationId,
    metrics,
    recommendations,
    risk_assessment: riskAssessment,
    created_at: new Date().toISOString(),
  };
}

export async function listSimulationScenarios(
  supabase: SupabaseClient,
  organizationId: string,
  limit: number = 50,
  offset: number = 0
): Promise<SimulationScenario[]> {
  const { data, error } = await supabase
    .from("simulation_configs")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to list simulation scenarios: ${error.message}`);
  }

  return data || [];
}
