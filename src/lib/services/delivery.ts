import type { SupabaseClient } from "@supabase/supabase-js";
import { pingConnector } from "../connectors/executor";
import type { ConnectorConfig } from "../connectors/types";

export type DeliveryInput = {
  transaction_id: string;
  opportunity_id: string;
  organization_id: string;
  delivery_type: "native" | "external";
  delivery_target_id: string; // campaign_id or connector_id
  lead_data: Record<string, unknown>;
  consumer_data?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
};

export type DeliveryAttemptRecord = {
  id: string;
  transaction_id: string;
  delivery_type: "native" | "external";
  attempt_number: number;
  request_body?: string;
  response_body?: string;
  response_status_code?: number;
  latency_ms: number;
  success: boolean;
  error_message?: string;
  next_attempt_at?: string;
  created_at: string;
};

export type DeliveryResult = {
  success: boolean;
  delivery_type: "native" | "external";
  attempt_number: number;
  latency_ms: number;
  status_code?: number;
  response_data?: Record<string, unknown>;
  error_message?: string;
  next_attempt_at?: string;
  should_retry: boolean;
};

const DELIVERY_RETRY_POLICY = {
  max_attempts: 5,
  initial_delay_ms: 30000, // 30 seconds
  backoff_multiplier: 4,
  max_delay_ms: 3600000, // 1 hour
  sla_window_ms: 1800000, // 30 minutes
};

const TERMINAL_STATUS_CODES = [200, 201, 202, 204]; // Success codes
const RETRY_STATUS_CODES = [408, 429, 500, 502, 503, 504]; // Retry codes

export async function deliverLead(
  supabase: SupabaseClient,
  input: DeliveryInput,
  connectorOrCampaign?: ConnectorConfig,
): Promise<DeliveryResult> {
  const startTime = Date.now();

  try {
    // Get current delivery attempt count
    const { data: attempts, error: attemptsError } = await supabase
      .from("deliveries")
      .select("id")
      .eq("transaction_id", input.transaction_id)
      .eq("status", "pending");

    if (attemptsError) throw attemptsError;
    const attemptNumber = (attempts?.length || 0) + 1;

    // Check if max attempts exceeded
    if (attemptNumber > DELIVERY_RETRY_POLICY.max_attempts) {
      return {
        success: false,
        delivery_type: input.delivery_type,
        attempt_number: attemptNumber,
        latency_ms: Date.now() - startTime,
        error_message: `Max delivery attempts (${DELIVERY_RETRY_POLICY.max_attempts}) exceeded`,
        should_retry: false,
      };
    }

    // Route to appropriate delivery method
    let result: DeliveryResult;
    if (input.delivery_type === "external" && connectorOrCampaign) {
      result = await deliverToExternalConnector(
        supabase,
        input,
        connectorOrCampaign,
        attemptNumber,
        startTime,
      );
    } else {
      result = await deliverToNativeEndpoint(
        supabase,
        input,
        attemptNumber,
        startTime,
      );
    }

    // Calculate next retry time if needed
    if (result.should_retry && result.attempt_number < DELIVERY_RETRY_POLICY.max_attempts) {
      const delayMs = Math.min(
        DELIVERY_RETRY_POLICY.initial_delay_ms *
          Math.pow(DELIVERY_RETRY_POLICY.backoff_multiplier, result.attempt_number - 1),
        DELIVERY_RETRY_POLICY.max_delay_ms,
      );
      result.next_attempt_at = new Date(Date.now() + delayMs).toISOString();
    }

    // Record delivery attempt
    await recordDeliveryAttempt(supabase, input, result);

    // Update transaction status
    if (result.success) {
      await updateTransactionStatus(supabase, input.transaction_id, "charged");
    }

    return result;
  } catch (error) {
    const latency = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return {
      success: false,
      delivery_type: input.delivery_type,
      attempt_number: 1,
      latency_ms: latency,
      error_message: errorMessage,
      should_retry: true,
    };
  }
}

async function deliverToExternalConnector(
  supabase: SupabaseClient,
  input: DeliveryInput,
  connector: ConnectorConfig,
  attemptNumber: number,
  startTime: number,
): Promise<DeliveryResult> {
  try {
    // Load opportunity to get vertical
    const { data: opportunity, error: oppError } = await supabase
      .from("opportunities")
      .select("vertical_id, product_id")
      .eq("id", input.opportunity_id)
      .single();

    if (oppError || !opportunity) {
      return {
        success: false,
        delivery_type: "external",
        attempt_number: attemptNumber,
        latency_ms: Date.now() - startTime,
        error_message: "Opportunity not found",
        should_retry: false,
      };
    }

    // Load vertical to get vertical code
    const { data: vertical, error: vertError } = await supabase
      .from("verticals")
      .select("code")
      .eq("id", opportunity.vertical_id)
      .single();

    if (vertError || !vertical) {
      return {
        success: false,
        delivery_type: "external",
        attempt_number: attemptNumber,
        latency_ms: Date.now() - startTime,
        error_message: "Vertical not found",
        should_retry: false,
      };
    }

    // Prepare lead data for external endpoint (matching PingRequest format)
    const externalRequest = {
      source_id: input.organization_id,
      external_submission_id: input.transaction_id,
      vertical: vertical.code,
      product: opportunity.product_id || undefined,
      consumer: input.consumer_data,
      attributes: input.attributes,
    };

    // Call external connector
    const connectorResponse = await pingConnector(connector, externalRequest);

    const latency = Date.now() - startTime;

    if (connectorResponse.success && connectorResponse.response) {
      return {
        success: true,
        delivery_type: "external",
        attempt_number: attemptNumber,
        latency_ms: latency,
        response_data: connectorResponse.response,
        should_retry: false,
      };
    }

    // Check if error is retryable
    const shouldRetry = connectorResponse.error_message?.includes("timeout") ||
      connectorResponse.error_message?.includes("network") ||
      attemptNumber < 3; // Retry first 2 attempts regardless

    return {
      success: false,
      delivery_type: "external",
      attempt_number: attemptNumber,
      latency_ms: latency,
      error_message: connectorResponse.error_message || "External connector failed",
      should_retry: shouldRetry,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    return {
      success: false,
      delivery_type: "external",
      attempt_number: attemptNumber,
      latency_ms: latency,
      error_message: error instanceof Error ? error.message : "Unknown error",
      should_retry: true,
    };
  }
}

async function deliverToNativeEndpoint(
  supabase: SupabaseClient,
  input: DeliveryInput,
  attemptNumber: number,
  startTime: number,
): Promise<DeliveryResult> {
  try {
    // Load campaign endpoint from database
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("endpoint_url, endpoint_method, endpoint_auth_type, endpoint_auth_credential")
      .eq("id", input.delivery_target_id)
      .single();

    if (campaignError || !campaign) {
      return {
        success: false,
        delivery_type: "native",
        attempt_number: attemptNumber,
        latency_ms: Date.now() - startTime,
        error_message: "Campaign endpoint not found",
        should_retry: false,
      };
    }

    // Prepare request
    const method = campaign.endpoint_method || "POST";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add auth headers
    if (campaign.endpoint_auth_type === "api_key" && campaign.endpoint_auth_credential) {
      headers["X-API-Key"] = campaign.endpoint_auth_credential;
    } else if (campaign.endpoint_auth_type === "bearer" && campaign.endpoint_auth_credential) {
      headers["Authorization"] = `Bearer ${campaign.endpoint_auth_credential}`;
    }

    // Call native endpoint
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(campaign.endpoint_url, {
      method,
      headers,
      body: JSON.stringify(input.lead_data),
      signal: controller.signal,
    });

    clearTimeout(timeoutHandle);

    const latency = Date.now() - startTime;
    const responseText = await response.text();

    if (TERMINAL_STATUS_CODES.includes(response.status)) {
      return {
        success: true,
        delivery_type: "native",
        attempt_number: attemptNumber,
        latency_ms: latency,
        status_code: response.status,
        response_data: responseText ? JSON.parse(responseText) : undefined,
        should_retry: false,
      };
    }

    const shouldRetry = RETRY_STATUS_CODES.includes(response.status) ||
      response.status >= 500;

    return {
      success: false,
      delivery_type: "native",
      attempt_number: attemptNumber,
      latency_ms: latency,
      status_code: response.status,
      error_message: `HTTP ${response.status}: ${responseText}`,
      should_retry: shouldRetry,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const shouldRetry = errorMessage.includes("timeout") || errorMessage.includes("network");

    return {
      success: false,
      delivery_type: "native",
      attempt_number: attemptNumber,
      latency_ms: latency,
      error_message: errorMessage,
      should_retry: shouldRetry,
    };
  }
}

async function recordDeliveryAttempt(
  supabase: SupabaseClient,
  input: DeliveryInput,
  result: DeliveryResult,
): Promise<void> {
  const status = result.success ? "accepted" : result.should_retry ? "pending" : "failed";

  const { error } = await supabase.from("deliveries").insert({
    transaction_id: input.transaction_id,
    opportunity_id: input.opportunity_id,
    organization_id: input.organization_id,
    delivery_type: input.delivery_type,
    delivery_target_id: input.delivery_target_id,
    attempt_number: result.attempt_number,
    status,
    latency_ms: result.latency_ms,
    response_status_code: result.status_code,
    success: result.success,
    error_message: result.error_message,
    next_attempt_at: result.next_attempt_at,
  });

  if (error) {
    console.error("Failed to record delivery attempt:", error);
  }

  if (status === "failed") {
    const { emitNotification } = await import("@/lib/notifications");
    await emitNotification(supabase, {
      organizationId: input.organization_id,
      type: "webhook.delivery.failed",
      severity: "warning",
      title: "Webhook delivery failed",
      body: result.error_message ?? "Buyer endpoint returned a terminal failure.",
      href: `/workspace/advertiser/integrations`,
      dedupeKey: `webhook-failed:${input.transaction_id}:${result.attempt_number}`,
      payload: {
        transaction_id: input.transaction_id,
        attempt_number: result.attempt_number,
        status_code: result.status_code ?? null,
      },
    });
  }
}

async function updateTransactionStatus(
  supabase: SupabaseClient,
  transactionId: string,
  newStatus: string,
): Promise<void> {
  const { error } = await supabase
    .from("transactions")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", transactionId);

  if (error) {
    console.error("Failed to update transaction status:", error);
  }
}

// Retry helper for cron jobs
export async function retryPendingDeliveries(
  supabase: SupabaseClient,
): Promise<{ succeeded: number; failed: number; rescheduled: number }> {
  const now = new Date();

  // Find deliveries that need retry
  const { data: pendingDeliveries, error: queryError } = await supabase
    .from("deliveries")
    .select("*")
    .eq("status", "pending")
    .lte("next_attempt_at", now.toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(10);

  if (queryError || !pendingDeliveries) {
    return { succeeded: 0, failed: 0, rescheduled: 0 };
  }

  let succeeded = 0;
  let failed = 0;
  let rescheduled = 0;

  for (const delivery of pendingDeliveries) {
    // Load transaction and opportunity
    const { data: transaction } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", delivery.transaction_id)
      .single();

    if (!transaction) continue;

    // Retry delivery
    const result = await deliverLead(supabase, {
      transaction_id: delivery.transaction_id,
      opportunity_id: delivery.opportunity_id,
      organization_id: delivery.organization_id,
      delivery_type: delivery.delivery_type,
      delivery_target_id: delivery.delivery_target_id,
      lead_data: delivery.lead_data || {},
    });

    if (result.success) {
      succeeded++;
    } else if (result.should_retry) {
      rescheduled++;
    } else {
      failed++;
    }
  }

  return { succeeded, failed, rescheduled };
}
