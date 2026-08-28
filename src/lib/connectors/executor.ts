/**
 * Connector executor: ping external buyers/ping trees.
 *
 * Handles HTTP requests to external endpoints, response normalization,
 * timeout/retry logic, and health tracking.
 */

import type { ConnectorResponse, PingRequest, PingResponse, ConnectorConfig } from "./types";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RETRY_POLICY = {
  max_retries: 2,
  initial_delay_ms: 100,
  backoff_multiplier: 2,
  max_delay_ms: 2000,
};

/**
 * Ping external connector (buyer/ping tree/network).
 * Handles serialization, HTTP, parsing, timeout, and retry.
 */
export async function pingConnector(
  config: ConnectorConfig,
  request: PingRequest,
): Promise<ConnectorResponse> {
  const startTime = Date.now();
  const timeoutMs = config.timeout_ms || DEFAULT_TIMEOUT_MS;
  const retryPolicy = config.retry_policy || DEFAULT_RETRY_POLICY;

  let lastError: Error | null = null;
  let retryCount = 0;

  for (let attempt = 0; attempt <= retryPolicy.max_retries; attempt++) {
    try {
      if (attempt > 0) {
        const delayMs = Math.min(
          retryPolicy.initial_delay_ms * Math.pow(retryPolicy.backoff_multiplier, attempt - 1),
          retryPolicy.max_delay_ms,
        );
        await sleep(delayMs);
        retryCount = attempt;
      }

      const response = await executePingRequest(config, request, timeoutMs);

      if (response.success) {
        return {
          connector_id: config.id,
          connector_name: config.name,
          success: true,
          response: response.data,
          latency_ms: Date.now() - startTime,
          attempted_at: new Date().toISOString(),
          retry_count: retryCount,
        };
      }

      lastError = new Error(response.error || "Unknown error");

      // Don't retry on non-transient errors
      if (response.transient === false) {
        break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on parse errors or other non-transient issues
      if (
        lastError.message.includes("parse") ||
        lastError.message.includes("timeout") === false
      ) {
        break;
      }
    }
  }

  return {
    connector_id: config.id,
    connector_name: config.name,
    success: false,
    error_code: "CONNECTOR_FAILED",
    error_message: lastError?.message || "External connector failed after retries",
    latency_ms: Date.now() - startTime,
    attempted_at: new Date().toISOString(),
    retry_count: retryCount,
  };
}

/**
 * Execute single HTTP request to external connector.
 */
async function executePingRequest(
  config: ConnectorConfig,
  request: PingRequest,
  timeoutMs: number,
): Promise<{
  success: boolean;
  data?: PingResponse;
  error?: string;
  transient?: boolean;
}> {
  if (!config.endpoint_url) {
    return { success: false, error: "No endpoint configured", transient: false };
  }

  const serialized = serializeRequest(config, request);

  try {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(config.endpoint_url, {
      method: config.method || "POST",
      headers: buildHeaders(config, serialized),
      body: serialized.body,
      signal: controller.signal,
    });

    clearTimeout(timeoutHandle);

    if (!response.ok) {
      // Retry on server errors (5xx), not client errors (4xx)
      return {
        success: false,
        error: `HTTP ${response.status}`,
        transient: response.status >= 500,
      };
    }

    const responseText = await response.text();
    const parsed = parseResponse(config, responseText);

    if (!parsed) {
      return { success: false, error: "Failed to parse response", transient: false };
    }

    return { success: true, data: parsed };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return {
          success: false,
          error: `Timeout after ${timeoutMs}ms`,
          transient: true,
        };
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      transient: true,
    };
  }
}

/**
 * Serialize Qentrax request to external format.
 */
function serializeRequest(
  config: ConnectorConfig,
  request: PingRequest,
): {
  headers: Record<string, string>;
  body: string;
} {
  const format = config.request_format || "json";

  // Map Qentrax fields to external field names
  const mapped = mapFields(request, config.ping_field_mapping || {});

  if (format === "json") {
    return {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mapped),
    };
  }

  if (format === "xml") {
    return {
      headers: { "Content-Type": "application/xml" },
      body: jsonToXml(mapped),
    };
  }

  if (format === "form") {
    return {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(flattenObject(mapped)).toString(),
    };
  }

  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mapped),
  };
}

/**
 * Build HTTP headers for external request.
 */
function buildHeaders(
  config: ConnectorConfig,
  serialized: { headers: Record<string, string> },
): Record<string, string> {
  const headers = { ...serialized.headers };

  // Add auth headers
  if (config.auth_type === "api_key" && config.auth_credential_ref) {
    headers["X-API-Key"] = config.auth_credential_ref; // TODO: decrypt from vault
  }

  if (config.auth_type === "bearer" && config.auth_credential_ref) {
    headers["Authorization"] = `Bearer ${config.auth_credential_ref}`; // TODO: decrypt
  }

  // Add custom headers
  if (config.headers) {
    Object.assign(headers, config.headers);
  }

  return headers;
}

/**
 * Parse external response to canonical PingResponse.
 */
function parseResponse(config: ConnectorConfig, responseText: string): PingResponse | null {
  try {
    const format = config.response_format || "json";

    let data: unknown;

    if (format === "json") {
      data = JSON.parse(responseText);
    } else if (format === "xml") {
      data = xmlToJson(responseText);
    } else {
      data = parseQueryString(responseText);
    }

    if (typeof data !== "object" || data === null) {
      return null;
    }

    const obj = data as Record<string, unknown>;

    // Normalize to canonical response
    const reasonCode = normalizeString(obj.reason_code) ?? normalizeString(obj.reason);
    const externalId =
      normalizeString(obj.transaction_id) ??
      normalizeString(obj.external_id) ??
      normalizeString(obj.id);
    const expiresAt = normalizeIsoDate(obj.expires_at) ?? normalizeIsoDate(obj.expires);

    return {
      eligible: normalizeBoolean(obj.eligible ?? obj.accepted ?? obj.status === "accepted"),
      bid_cents:
        normalizeNumber(obj.bid_cents) ??
        normalizeNumber(obj.bid) ??
        normalizeNumber(obj.price),
      bid_type: normalizeString(obj.bid_type) ?? "fixed",
      status: normalizeStatus(obj.status),
      reason_code: reasonCode || undefined,
      external_transaction_id: externalId || undefined,
      expires_at: expiresAt || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Helper functions for type normalization.
 */

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  if (typeof value === "number") return value !== 0;
  return false;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number") return Math.round(value);
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value == null) return null;
  return String(value);
}

function normalizeIsoDate(value: unknown): string | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return value;
  }
  return null;
}

function normalizeStatus(value: unknown): "accepted" | "rejected" | "review" {
  const str = normalizeString(value)?.toLowerCase();
  if (str === "accepted" || str === "accept" || str === "yes" || str === "true") {
    return "accepted";
  }
  if (str === "review" || str === "pending") {
    return "review";
  }
  return "rejected";
}

/**
 * Field mapping: map Qentrax fields to external names.
 */
function mapFields(
  data: Record<string, unknown>,
  mapping: Record<string, string>,
): Record<string, unknown> {
  if (Object.keys(mapping).length === 0) {
    return data; // No mapping; return as-is
  }

  const result: Record<string, unknown> = {};
  for (const [qxField, externalField] of Object.entries(mapping)) {
    if (qxField in data) {
      result[externalField] = data[qxField];
    }
  }
  return result;
}

/**
 * Utility functions for serialization.
 */

function jsonToXml(obj: Record<string, unknown>): string {
  let xml = '<?xml version="1.0"?>\n<request>\n';
  for (const [key, value] of Object.entries(obj)) {
    xml += `  <${key}>${escapeXml(String(value))}</${key}>\n`;
  }
  xml += "</request>";
  return xml;
}

function xmlToJson(xml: string): Record<string, unknown> {
  // Placeholder: proper XML parsing would use DOMParser or xml2js
  // For now, return empty object
  return {};
}

function parseQueryString(qs: string): Record<string, unknown> {
  const params = new URLSearchParams(qs);
  const result: Record<string, unknown> = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object" && value !== null) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, newKey));
    } else {
      result[newKey] = String(value);
    }
  }
  return result;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
