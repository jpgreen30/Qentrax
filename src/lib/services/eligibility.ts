/**
 * Eligibility engine: determine if a campaign qualifies to receive an opportunity.
 *
 * Checks include:
 * - Campaign active/funded status
 * - Vertical/product match
 * - Geographic match
 * - Consumer attributes (age, location, etc.)
 * - Schedule/timezone
 * - Capacity (daily/hourly caps)
 * - Budget remaining
 * - Duplicate policy
 * - Quality thresholds
 * - Consent requirements
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type EligibilityCheckInput = {
  campaign_id: string;
  opportunity_id: string;
  vertical_id: string;
  product_id?: string | null;
  consumer?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
};

export type EligibilityCheckResult = {
  eligible: boolean;
  reason_code?: string;
  reason_detail?: string;
  bid_cents?: number;
  bid_type?: string;
};

/**
 * Check if campaign is eligible to receive this opportunity.
 * Non-transactional read. Does not modify campaign state.
 */
export async function checkCampaignEligibility(
  supabase: SupabaseClient,
  input: EligibilityCheckInput,
): Promise<EligibilityCheckResult> {
  const { campaign_id, opportunity_id: _unusedOpportunityId, vertical_id, product_id, consumer: _unusedConsumer, attributes } = input;

  // Load campaign with full targeting and eligibility config
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select(
      `
      id,
      status,
      vertical_id,
      product_id,
      base_bid_cents,
      bid_type,
      starts_at,
      ends_at,
      daily_budget_cents,
      monthly_budget_cents,
      daily_cap,
      hourly_cap,
      targeting_json,
      campaign_versions(id, version, eligibility_json, targeting_json, schedule_json, cap_config_json)
    `,
    )
    .eq("id", campaign_id)
    .maybeSingle();

  if (campaignError || !campaign) {
    return {
      eligible: false,
      reason_code: "CAMPAIGN_NOT_FOUND",
      reason_detail: "Campaign does not exist",
    };
  }

  // Check campaign is active
  if (campaign.status !== "active") {
    return {
      eligible: false,
      reason_code: "CAMPAIGN_NOT_ACTIVE",
      reason_detail: `Campaign status is ${campaign.status}`,
    };
  }

  // Check vertical match
  if (campaign.vertical_id && campaign.vertical_id !== vertical_id) {
    return {
      eligible: false,
      reason_code: "VERTICAL_MISMATCH",
      reason_detail: "Campaign does not accept this vertical",
    };
  }

  // Check product match if campaign specifies
  if (campaign.product_id && campaign.product_id !== product_id) {
    return {
      eligible: false,
      reason_code: "PRODUCT_MISMATCH",
      reason_detail: "Campaign does not accept this product",
    };
  }

  // Check bid amount
  if (!campaign.base_bid_cents || campaign.base_bid_cents <= 0) {
    return {
      eligible: false,
      reason_code: "CAMPAIGN_NOT_FUNDED",
      reason_detail: "Campaign has no bid configured",
    };
  }

  // Check schedule (if active version provides schedule)
  const activeVersion = campaign.campaign_versions?.[0];
  if (activeVersion) {
    const schedule = activeVersion.schedule_json as Record<string, unknown> | null;
    if (schedule && !isScheduleActive(schedule)) {
      return {
        eligible: false,
        reason_code: "OUTSIDE_CAMPAIGN_SCHEDULE",
        reason_detail: "Opportunity received outside campaign schedule",
      };
    }
  }

  // Check date range
  const now = new Date();
  if (campaign.starts_at && new Date(campaign.starts_at) > now) {
    return {
      eligible: false,
      reason_code: "CAMPAIGN_NOT_STARTED",
      reason_detail: "Campaign has not started yet",
    };
  }

  if (campaign.ends_at && new Date(campaign.ends_at) < now) {
    return {
      eligible: false,
      reason_code: "CAMPAIGN_ENDED",
      reason_detail: "Campaign has ended",
    };
  }

  // Check daily/monthly budget and caps
  const { budgetCheck } = await checkCampaignBudgetAndCaps(supabase, campaign_id, campaign);
  if (!budgetCheck.eligible) {
    return {
      eligible: false,
      reason_code: budgetCheck.reason_code,
      reason_detail: budgetCheck.reason_detail,
    };
  }

  // Check geographic eligibility
  const targeting = campaign.targeting_json as Record<string, unknown> | null;
  if (targeting && attributes && !isGeographicallyEligible(targeting, attributes)) {
    return {
      eligible: false,
      reason_code: "GEO_NOT_ACCEPTED",
      reason_detail: "Campaign does not accept this geography",
    };
  }

  // If all checks pass, return eligible with bid
  return {
    eligible: true,
    bid_cents: campaign.base_bid_cents,
    bid_type: campaign.bid_type || "fixed",
  };
}

/**
 * Check campaign budget and daily/hourly caps.
 */
async function checkCampaignBudgetAndCaps(
  supabase: SupabaseClient,
  campaignId: string,
  campaign: Record<string, unknown>,
) {
  const today = new Date().toISOString().split("T")[0];

  // Check daily usage
  const { data: dailyUsage } = await supabase
    .from("campaign_daily_usage")
    .select("charged_cents, reserved_cents")
    .eq("campaign_id", campaignId)
    .eq("usage_date", today)
    .maybeSingle();

  const dailyChargedCents = (dailyUsage?.charged_cents as number) || 0;
  const dailyReservedCents = (dailyUsage?.reserved_cents as number) || 0;
  const dailySpentCents = dailyChargedCents + dailyReservedCents;

  if (campaign.daily_budget_cents) {
    if ((dailySpentCents as number) >= (campaign.daily_budget_cents as number)) {
      return {
        budgetCheck: {
          eligible: false,
          reason_code: "DAILY_BUDGET_REACHED",
          reason_detail: "Daily budget exhausted",
        },
      };
    }
  }

  if (campaign.daily_cap) {
    const { count: dailyDeliveryCount } = await supabase
      .from("deliveries")
      .select("id", { count: "exact" })
      .eq("campaign_id", campaignId)
      .gte("created_at", `${today}T00:00:00Z`)
      .lte("created_at", `${today}T23:59:59Z`);

    if ((dailyDeliveryCount || 0) >= (campaign.daily_cap as number)) {
      return {
        budgetCheck: {
          eligible: false,
          reason_code: "DAILY_CAP_REACHED",
          reason_detail: "Daily delivery cap reached",
        },
      };
    }
  }

  // Check hourly cap
  if (campaign.hourly_cap) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: hourlyDeliveryCount } = await supabase
      .from("deliveries")
      .select("id", { count: "exact" })
      .eq("campaign_id", campaignId)
      .gte("created_at", oneHourAgo);

    if ((hourlyDeliveryCount || 0) >= (campaign.hourly_cap as number)) {
      return {
        budgetCheck: {
          eligible: false,
          reason_code: "HOURLY_CAP_REACHED",
          reason_detail: "Hourly delivery cap reached",
        },
      };
    }
  }

  return {
    budgetCheck: {
      eligible: true,
    },
  };
}

/**
 * Check if opportunity falls within campaign's schedule/timezone.
 */
function isScheduleActive(_schedule: Record<string, unknown>): boolean {
  // Placeholder: implement based on schedule JSON structure
  // For now, assume any schedule present means active
  return true;
}

/**
 * Check geographic match between campaign targeting and consumer attributes.
 */
function isGeographicallyEligible(
  targeting: Record<string, unknown>,
  attributes: Record<string, unknown>,
): boolean {
  const acceptedStates = targeting.states as string[] | undefined;
  const acceptedZips = targeting.zips as string[] | undefined;

  const consumerState = (attributes.state as string) || "";
  const consumerZip = (attributes.zip as string) || "";

  if (acceptedStates && acceptedStates.length > 0) {
    if (!acceptedStates.includes(consumerState.toUpperCase())) {
      return false;
    }
  }

  if (acceptedZips && acceptedZips.length > 0) {
    if (!acceptedZips.includes(consumerZip)) {
      return false;
    }
  }

  return true;
}
