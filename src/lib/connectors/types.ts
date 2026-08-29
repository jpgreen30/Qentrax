/**
 * External connector framework types.
 *
 * Supports pluggable integrations for third-party ping trees,
 * external buyers, networks, and other platforms.
 */

export enum ConnectorType {
  EXTERNAL_PING_TREE = "external_ping_tree",
  EXTERNAL_BUYER = "external_buyer",
  NETWORK = "network",
  CRM = "crm",
  WEBHOOK = "webhook",
  SFTP = "sftp",
}

export enum ConnectorStatus {
  ACTIVE = "active",
  TESTING = "testing",
  PAUSED = "paused",
  ERROR = "error",
  DISABLED = "disabled",
}

export type ConnectorConfig = {
  id: string;
  organization_id: string;
  connector_type: ConnectorType;
  name: string;
  status: ConnectorStatus;
  endpoint_url?: string;
  method?: "GET" | "POST" | "PUT";
  headers?: Record<string, string>;
  auth_type?: "none" | "api_key" | "bearer" | "basic" | "oauth";
  auth_credential_ref?: string;
  request_format?: "json" | "xml" | "form";
  response_format?: "json" | "xml";
  ping_field_mapping?: FieldMapping;
  post_field_mapping?: FieldMapping;
  timeout_ms?: number;
  retry_policy?: RetryPolicy;
  health_check_enabled?: boolean;
  health_check_frequency_seconds?: number;
  created_at: string;
  updated_at: string;
};

export type FieldMapping = {
  [qentraxField: string]: string; // Maps Qentrax field to external field name
};

export type RetryPolicy = {
  max_retries: number;
  initial_delay_ms: number;
  backoff_multiplier: number;
  max_delay_ms: number;
};

export type PingRequest = {
  source_id: string;
  external_submission_id: string;
  vertical: string;
  product?: string | null;
  consumer?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  consent?: Record<string, unknown>;
};

export type PingResponse = {
  eligible: boolean;
  bid_cents?: number | null;
  bid_type?: string;
  status: "accepted" | "rejected" | "review";
  reason_code?: string;
  external_transaction_id?: string;
  expires_at?: string;
};

export type ConnectorResponse = {
  connector_id: string;
  connector_name: string;
  success: boolean;
  response?: PingResponse;
  error_code?: string;
  error_message?: string;
  latency_ms: number;
  attempted_at: string;
  retry_count: number;
};

export type PingTreeRequest = {
  advertiser_id?: string;
  vertical: string;
  product?: string;
  consumer?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  consent?: Record<string, unknown>;
};

export type PingTreeResponse = {
  status: "accepted" | "rejected" | "review";
  bid?: number;
  id?: string;
  expires_at?: string;
  reason?: string;
};

export type ConnectorHealthStatus = {
  connector_id: string;
  status: "healthy" | "degraded" | "unhealthy";
  last_check_at: string;
  last_successful_at?: string;
  consecutive_failures: number;
  error_rate: number; // 0.0 - 1.0
  avg_latency_ms: number;
  last_error?: string;
};
