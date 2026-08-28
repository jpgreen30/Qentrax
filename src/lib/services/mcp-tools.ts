import type { SupabaseClient } from "@supabase/supabase-js";

export type MCPTool = "find_demand" | "get_requirements" | "check_opportunity" | "get_performance" | "submit_opportunity" | "update_campaign" | "report_conversion";

export type MCPPermission = "read" | "write" | "admin";

export type MCPContext = {
  userId: string;
  organizationId: string;
  role: "publisher" | "advertiser" | "admin";
  permissions: MCPPermission[];
};

export type SafetyCheckResult = {
  allowed: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
  riskLevel: "low" | "medium" | "high" | "critical";
};

export type MCPToolCall = {
  tool: MCPTool;
  params: Record<string, unknown>;
  context: MCPContext;
};

const TOOL_PERMISSIONS: Record<MCPTool, MCPPermission[]> = {
  find_demand: ["read"],
  get_requirements: ["read"],
  check_opportunity: ["read"],
  get_performance: ["read"],
  submit_opportunity: ["write"],
  update_campaign: ["write"],
  report_conversion: ["write"],
};

const SAFETY_RULES = {
  submit_opportunity: {
    requiresAuth: true,
    requiresOrgMatch: true,
    riskLevel: "medium" as const,
    maxBatchSize: 100,
    requiresConfirmation: false,
  },
  update_campaign: {
    requiresAuth: true,
    requiresOrgMatch: true,
    riskLevel: "high" as const,
    requiresConfirmation: true,
    allowedFields: ["name", "bid_amount", "status", "daily_cap", "monthly_cap"],
  },
  report_conversion: {
    requiresAuth: true,
    requiresOrgMatch: true,
    riskLevel: "low" as const,
    requiresConfirmation: false,
  },
};

export async function validateMCPToolAccess(
  supabase: SupabaseClient,
  context: MCPContext,
  tool: MCPTool
): Promise<SafetyCheckResult> {
  // Check if user has required permissions
  const requiredPermissions = TOOL_PERMISSIONS[tool];
  const hasPermission = requiredPermissions.some((p) => context.permissions.includes(p));

  if (!hasPermission) {
    return {
      allowed: false,
      reason: `User lacks required permissions for ${tool}. Required: ${requiredPermissions.join(", ")}`,
      riskLevel: "critical",
    };
  }

  // Check organization access
  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", context.organizationId)
    .eq("user_id", context.userId)
    .single();

  if (error || !membership) {
    return {
      allowed: false,
      reason: "User is not a member of the organization",
      riskLevel: "critical",
    };
  }

  // Tool-specific safety checks
  const safetyRule = SAFETY_RULES[tool as keyof typeof SAFETY_RULES];
  if (!safetyRule) {
    return { allowed: true, riskLevel: "low" };
  }

  return {
    allowed: true,
    riskLevel: safetyRule.riskLevel,
    requiresConfirmation: safetyRule.requiresConfirmation,
  };
}

export async function submitOpportunityViaMCP(
  supabase: SupabaseClient,
  context: MCPContext,
  data: {
    source_id: string;
    vertical_id: string;
    product_id: string;
    consumer_data: Record<string, unknown>;
    idempotency_key?: string;
  }
): Promise<{ success: boolean; opportunity_id?: string; error?: string }> {
  try {
    // Validate access
    const accessCheck = await validateMCPToolAccess(supabase, context, "submit_opportunity");
    if (!accessCheck.allowed) {
      return { success: false, error: accessCheck.reason };
    }

    // Validate source belongs to organization
    const { data: source, error: sourceError } = await supabase
      .from("publisher_sources")
      .select("id")
      .eq("id", data.source_id)
      .eq("organization_id", context.organizationId)
      .single();

    if (sourceError || !source) {
      return { success: false, error: "Source not found or not owned by organization" };
    }

    // Create opportunity record
    const opportunityId = crypto.randomUUID();
    const idempotencyKey = data.idempotency_key || crypto.randomUUID();

    const { error: insertError } = await supabase.from("opportunities").insert([
      {
        id: opportunityId,
        source_id: data.source_id,
        organization_id: context.organizationId,
        vertical_id: data.vertical_id,
        product_id: data.product_id,
        consumer_data: data.consumer_data,
        idempotency_key: idempotencyKey,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    if (insertError) {
      // Check if it's duplicate idempotency key
      if (insertError.code === "23505") {
        const { data: existing } = await supabase
          .from("opportunities")
          .select("id")
          .eq("idempotency_key", idempotencyKey)
          .single();
        return {
          success: true,
          opportunity_id: existing?.id || opportunityId,
        };
      }
      return { success: false, error: insertError.message };
    }

    return { success: true, opportunity_id: opportunityId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function updateCampaignViaMCP(
  supabase: SupabaseClient,
  context: MCPContext,
  campaignId: string,
  updates: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate access
    const accessCheck = await validateMCPToolAccess(supabase, context, "update_campaign");
    if (!accessCheck.allowed) {
      return { success: false, error: accessCheck.reason };
    }

    // Validate campaign belongs to organization and user role
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, organization_id")
      .eq("id", campaignId)
      .eq("organization_id", context.organizationId)
      .single();

    if (campaignError || !campaign) {
      return { success: false, error: "Campaign not found or not owned by organization" };
    }

    // Only allow specific fields to be updated
    const allowedFields = SAFETY_RULES.update_campaign.allowedFields;
    const safeUpdates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (field in updates) {
        safeUpdates[field] = updates[field];
      }
    }

    safeUpdates.updated_at = new Date().toISOString();

    // Validate bid amount if being updated
    if ("bid_amount" in safeUpdates && typeof safeUpdates.bid_amount === "number") {
      if (safeUpdates.bid_amount < 0 || safeUpdates.bid_amount > 10000) {
        return { success: false, error: "Bid amount must be between 0 and 10000" };
      }
    }

    const { error: updateError } = await supabase
      .from("campaigns")
      .update(safeUpdates)
      .eq("id", campaignId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function reportConversionViaMCP(
  supabase: SupabaseClient,
  context: MCPContext,
  data: {
    delivery_id: string;
    transaction_id: string;
    conversion_status: "qualified" | "approved" | "rejected";
    conversion_value?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate access
    const accessCheck = await validateMCPToolAccess(supabase, context, "report_conversion");
    if (!accessCheck.allowed) {
      return { success: false, error: accessCheck.reason };
    }

    // Validate delivery belongs to organization
    const { data: delivery, error: deliveryError } = await supabase
      .from("deliveries")
      .select("id, organization_id")
      .eq("id", data.delivery_id)
      .eq("organization_id", context.organizationId)
      .single();

    if (deliveryError || !delivery) {
      return { success: false, error: "Delivery not found or not owned by organization" };
    }

    // Create conversion event
    const { error: insertError } = await supabase.from("conversion_events").insert([
      {
        id: crypto.randomUUID(),
        delivery_id: data.delivery_id,
        transaction_id: data.transaction_id,
        organization_id: context.organizationId,
        conversion_status: data.conversion_status,
        conversion_value: data.conversion_value,
        conversion_date: new Date().toISOString(),
        event_type: "lead_qualified",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function getOrganizationContext(
  supabase: SupabaseClient,
  userId: string,
  organizationId?: string
): Promise<MCPContext | null> {
  // Get user memberships
  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId);

  if (error || !memberships || memberships.length === 0) {
    return null;
  }

  // If organizationId provided, must be in memberships
  let targetOrg = organizationId;
  if (targetOrg) {
    const membership = memberships.find((m) => m.organization_id === targetOrg);
    if (!membership) {
      return null;
    }
  } else {
    // If not provided and only one org, use it
    if (memberships.length === 1) {
      targetOrg = memberships[0].organization_id;
    } else {
      // Multiple orgs and none specified - ambiguous
      return null;
    }
  }

  const membership = memberships.find((m) => m.organization_id === targetOrg);
  const role = membership?.role || "publisher";

  // Determine permissions based on role
  let permissions: MCPPermission[] = ["read"];
  if (role === "advertiser" || role === "admin") {
    permissions.push("write");
  }
  if (role === "admin") {
    permissions.push("admin");
  }

  return {
    userId,
    organizationId: targetOrg!,
    role: role as "publisher" | "advertiser" | "admin",
    permissions,
  };
}
