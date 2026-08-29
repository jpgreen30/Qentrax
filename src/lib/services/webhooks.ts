import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";

export type WebhookEventType =
  | "delivery.accepted"
  | "delivery.rejected"
  | "delivery.review"
  | "delivery.failed"
  | "return.requested"
  | "return.approved"
  | "return.rejected";

export type WebhookEvent = {
  id: string;
  event_type: WebhookEventType;
  delivery_id?: string;
  return_id?: string;
  transaction_id: string;
  organization_id: string;
  connector_id: string;
  timestamp: string;
  data: Record<string, unknown>;
};

export type WebhookEndpoint = {
  id: string;
  organization_id: string;
  connector_id: string;
  url: string;
  auth_type?: "none" | "hmac" | "api_key" | "bearer";
  auth_credential?: string;
  events: WebhookEventType[];
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type WebhookDelivery = {
  id: string;
  webhook_endpoint_id: string;
  event_id: string;
  status: "pending" | "sent" | "failed" | "retrying";
  attempt_number: number;
  response_status_code?: number;
  response_body?: string;
  error_message?: string;
  next_attempt_at?: string;
  created_at: string;
  updated_at: string;
};

const WEBHOOK_RETRY_POLICY = {
  max_attempts: 5,
  initial_delay_ms: 5000, // 5 seconds
  backoff_multiplier: 2,
  max_delay_ms: 3600000, // 1 hour
};

export async function triggerWebhookEvent(
  supabase: SupabaseClient,
  event: WebhookEvent,
): Promise<void> {
  try {
    // Find all webhook endpoints for this connector and organization
    const { data: endpoints, error: endpointsError } = await supabase
      .from("webhook_endpoints")
      .select("*")
      .eq("connector_id", event.connector_id)
      .eq("organization_id", event.organization_id)
      .eq("active", true);

    if (endpointsError) throw endpointsError;

    if (!endpoints || endpoints.length === 0) return;

    // Filter endpoints that are subscribed to this event type
    const subscribedEndpoints = endpoints.filter((ep) =>
      ep.events.includes(event.event_type)
    );

    // Create delivery records for each subscribed endpoint
    const deliveries = subscribedEndpoints.map((endpoint) => ({
      webhook_endpoint_id: endpoint.id,
      event_id: event.id,
      status: "pending" as const,
      attempt_number: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    if (deliveries.length > 0) {
      const { error: insertError } = await supabase
        .from("webhook_deliveries")
        .insert(deliveries);

      if (insertError) throw insertError;
    }
  } catch (error) {
    console.error("Failed to trigger webhook events:", error);
  }
}

export async function sendWebhookDelivery(
  supabase: SupabaseClient,
  delivery: WebhookDelivery,
): Promise<WebhookDelivery> {
  const startTime = Date.now();

  try {
    // Fetch the webhook endpoint configuration
    const { data: endpoint, error: endpointError } = await supabase
      .from("webhook_endpoints")
      .select("*")
      .eq("id", delivery.webhook_endpoint_id)
      .single();

    if (endpointError || !endpoint) {
      return {
        ...delivery,
        status: "failed",
        error_message: "Webhook endpoint not found",
      };
    }

    // Fetch the event data
    const { data: event, error: eventError } = await supabase
      .from("webhook_events")
      .select("*")
      .eq("id", delivery.event_id)
      .single();

    if (eventError || !event) {
      return {
        ...delivery,
        status: "failed",
        error_message: "Webhook event not found",
      };
    }

    // Prepare request headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Qentrax/2.0",
      "X-Webhook-Event": event.event_type,
      "X-Webhook-Timestamp": new Date().toISOString(),
      "X-Webhook-Delivery-ID": delivery.id,
    };

    // Add authentication headers
    if (endpoint.auth_type === "api_key" && endpoint.auth_credential) {
      headers["X-API-Key"] = endpoint.auth_credential;
    } else if (endpoint.auth_type === "bearer" && endpoint.auth_credential) {
      headers["Authorization"] = `Bearer ${endpoint.auth_credential}`;
    } else if (endpoint.auth_type === "hmac" && endpoint.auth_credential) {
      const signature = generateHmacSignature(event, endpoint.auth_credential);
      headers["X-Webhook-Signature"] = signature;
    }

    // Send webhook
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body: JSON.stringify(event),
      signal: controller.signal,
    });

    clearTimeout(timeoutHandle);

    const responseText = await response.text();
    const _latency = Date.now() - startTime;

    if (response.ok) {
      // Success
      const { error: updateError } = await supabase
        .from("webhook_deliveries")
        .update({
          status: "sent",
          response_status_code: response.status,
          response_body: responseText,
          updated_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);

      if (updateError) throw updateError;

      return {
        ...delivery,
        status: "sent",
        response_status_code: response.status,
        response_body: responseText,
      };
    }

    // Check if error is retryable
    const shouldRetry = response.status >= 500 || response.status === 408 || response.status === 429;

    if (!shouldRetry) {
      // Permanent failure
      const { error: updateError } = await supabase
        .from("webhook_deliveries")
        .update({
          status: "failed",
          response_status_code: response.status,
          response_body: responseText,
          error_message: `HTTP ${response.status}: ${responseText}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);

      if (updateError) throw updateError;

      return {
        ...delivery,
        status: "failed",
        response_status_code: response.status,
        error_message: `HTTP ${response.status}`,
      };
    }

    // Retryable failure
    if (delivery.attempt_number < WEBHOOK_RETRY_POLICY.max_attempts) {
      const delayMs = Math.min(
        WEBHOOK_RETRY_POLICY.initial_delay_ms *
          Math.pow(WEBHOOK_RETRY_POLICY.backoff_multiplier, delivery.attempt_number - 1),
        WEBHOOK_RETRY_POLICY.max_delay_ms,
      );

      const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();

      const { error: updateError } = await supabase
        .from("webhook_deliveries")
        .update({
          status: "retrying",
          attempt_number: delivery.attempt_number + 1,
          response_status_code: response.status,
          response_body: responseText,
          error_message: `HTTP ${response.status}: Retrying`,
          next_attempt_at: nextAttemptAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);

      if (updateError) throw updateError;

      return {
        ...delivery,
        status: "retrying",
        attempt_number: delivery.attempt_number + 1,
        next_attempt_at: nextAttemptAt,
      };
    }

    // Max retries exceeded
    const { error: updateError } = await supabase
      .from("webhook_deliveries")
      .update({
        status: "failed",
        response_status_code: response.status,
        response_body: responseText,
        error_message: `Max retries exceeded (${WEBHOOK_RETRY_POLICY.max_attempts})`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);

    if (updateError) throw updateError;

    return {
      ...delivery,
      status: "failed",
      error_message: `Max retries exceeded`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const _latency = Date.now() - startTime;

    // Update delivery with error (ignore if update fails)
    try {
      await supabase
        .from("webhook_deliveries")
        .update({
          status: delivery.attempt_number < WEBHOOK_RETRY_POLICY.max_attempts ? "retrying" : "failed",
          error_message: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);
    } catch {
      // Ignore errors updating the failed record
    }

    return {
      ...delivery,
      status: "failed",
      error_message: errorMessage,
    };
  }
}

export async function retryPendingWebhooks(
  supabase: SupabaseClient,
): Promise<{ succeeded: number; failed: number; rescheduled: number }> {
  const now = new Date();

  // Find deliveries ready for retry
  const { data: pendingDeliveries, error: queryError } = await supabase
    .from("webhook_deliveries")
    .select("*")
    .in("status", ["pending", "retrying"])
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
    const result = await sendWebhookDelivery(supabase, delivery);

    if (result.status === "sent") {
      succeeded++;
    } else if (result.status === "retrying") {
      rescheduled++;
    } else {
      failed++;
    }
  }

  return { succeeded, failed, rescheduled };
}

export function generateHmacSignature(
  event: WebhookEvent,
  secret: string,
): string {
  const payload = JSON.stringify(event);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return `sha256=${signature}`;
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  // Extract the hash part from "sha256=..." format
  const signatureParts = signature.split("=");
  if (signatureParts.length !== 2 || signatureParts[0] !== "sha256") {
    return false;
  }

  return signatureParts[1] === expectedSignature;
}

export async function receiveWebhookUpdate(
  supabase: SupabaseClient,
  organizationId: string,
  payload: Record<string, unknown>,
  signature?: string,
  secret?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    // Verify signature if provided
    if (signature && secret) {
      const payloadString = JSON.stringify(payload);
      if (!verifyWebhookSignature(payloadString, signature, secret)) {
        return {
          success: false,
          message: "Invalid webhook signature",
        };
      }
    }

    // Validate required fields
    const transactionId = payload.transaction_id as string;
    const status = payload.status as string;

    if (!transactionId || !status) {
      return {
        success: false,
        message: "Missing required fields: transaction_id, status",
      };
    }

    // Update delivery record with status update
    const deliveryStatus = status === "accepted" ? "accepted" :
                          status === "rejected" ? "failed" :
                          status === "review" ? "pending" : "failed";

    const { error: updateError } = await supabase
      .from("deliveries")
      .update({
        status: deliveryStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("transaction_id", transactionId)
      .eq("organization_id", organizationId);

    if (updateError) throw updateError;

    // If accepted, update transaction status to charged
    if (status === "accepted") {
      await supabase
        .from("transactions")
        .update({
          status: "charged",
          updated_at: new Date().toISOString(),
        })
        .eq("id", transactionId);
    }

    return {
      success: true,
      message: "Webhook received and processed",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message,
    };
  }
}
