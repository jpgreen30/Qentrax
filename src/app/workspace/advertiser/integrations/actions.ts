"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/workspace-data";
import { checkOutboundUrl } from "@/lib/security/outbound-url";
import { deliverToEndpoint } from "@/lib/delivery/http-delivery";

const BASE = "/workspace/advertiser/integrations";

function back(orgId: string, opts: { id?: string; error?: string; notice?: string } = {}): never {
  const q = new URLSearchParams({ org: orgId });
  if (opts.id) q.set("integration", opts.id);
  if (opts.error) q.set("error", opts.error);
  if (opts.notice) q.set("notice", opts.notice);
  redirect(`${BASE}?${q}`);
}

/** Field mappings arrive as parallel rows of Qentrax field -> destination field. */
function parseMapping(form: FormData, prefix: string): Record<string, string> {
  const sources = form.getAll(`${prefix}_source`).map((v) => String(v).trim());
  const targets = form.getAll(`${prefix}_target`).map((v) => String(v).trim());
  const mapping: Record<string, string> = {};
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    const target = targets[i] ?? "";
    if (!source || !target) continue;
    mapping[source] = target;
  }
  return mapping;
}

export async function saveIntegration(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const { supabase, org } = await requireOrg(orgId, "advertiser");

  const id = String(formData.get("integration_id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  const connectorType = String(formData.get("connector_type") ?? "webhook").trim();
  const endpointUrl = String(formData.get("endpoint_url") ?? "").trim();
  const method = String(formData.get("method") ?? "POST").trim().toUpperCase();
  const authType = String(formData.get("auth_type") ?? "none").trim();
  const timeoutRaw = String(formData.get("timeout_ms") ?? "").trim();

  if (!name) back(org.id, { id: id ?? undefined, error: "Name is required." });

  // The same guard the delivery worker applies, so a destination that could
  // never be delivered to is rejected at configuration time rather than
  // failing silently on every lead.
  const urlCheck = checkOutboundUrl(endpointUrl);
  if (!urlCheck.ok) {
    back(org.id, { id: id ?? undefined, error: `${urlCheck.reason}: ${urlCheck.detail}` });
  }

  if (!["POST", "PUT"].includes(method)) {
    back(org.id, { id: id ?? undefined, error: "Method must be POST or PUT." });
  }

  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : 10000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    back(org.id, {
      id: id ?? undefined,
      error: "Timeout must be a whole number of milliseconds between 1000 and 30000.",
    });
  }

  const row = {
    organization_id: org.id,
    name,
    connector_type: connectorType,
    endpoint_url: endpointUrl,
    method,
    auth_type: authType,
    timeout_ms: timeoutMs,
    ping_field_mapping: parseMapping(formData, "ping"),
    post_field_mapping: parseMapping(formData, "post"),
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { error } = await supabase
      .from("connectors")
      .update(row)
      .eq("id", id)
      .eq("organization_id", org.id);
    if (error) back(org.id, { id, error: error.message });
    back(org.id, { id, notice: "Integration saved." });
  }

  const { data, error } = await supabase
    .from("connectors")
    .insert({ ...row, status: "testing" })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    back(org.id, { error: error?.message ?? "Could not create the integration." });
  }
  revalidatePath(BASE);
  back(org.id, { id: data.id, notice: "Integration created. Send a test lead before activating." });
}

export async function setIntegrationStatus(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const id = String(formData.get("integration_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const { supabase, org } = await requireOrg(orgId, "advertiser");

  if (!["active", "inactive", "testing"].includes(status)) {
    back(org.id, { id, error: "Unsupported status." });
  }

  const { error } = await supabase
    .from("connectors")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", org.id);

  if (error) back(org.id, { id, error: error.message });
  revalidatePath(BASE);
  back(org.id, { id, notice: `Integration ${status}.` });
}

/**
 * Sends a clearly-marked test lead to the destination and records the attempt
 * alongside real deliveries, so the same history view shows how it behaved.
 * The payload carries no consumer data.
 */
export async function sendTestLead(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const id = String(formData.get("integration_id") ?? "");
  const { supabase, org } = await requireOrg(orgId, "advertiser");

  const { data: connector } = await supabase
    .from("connectors")
    .select("id, name, endpoint_url, timeout_ms, headers, auth_type")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (!connector) back(org.id, { id, error: "Integration not found." });

  const started = Date.now();
  const result = await deliverToEndpoint({
    endpointUrl: connector.endpoint_url,
    timeoutMs: connector.timeout_ms ?? 10000,
    headers: (connector.headers as Record<string, string>) ?? undefined,
    payload: {
      transaction_id: "test-transaction",
      opportunity_id: "test-opportunity",
      campaign_id: "test-campaign",
      vertical: "test",
      state: "CA",
      // Synthetic only. A test must never carry real consumer data.
      consumer: { first_name: "Test", last_name: "Lead", email: "test@example.com" },
      attributes: { qentrax_test: true },
      delivered_at: new Date().toISOString(),
    },
  });

  await supabase.from("connector_delivery_attempts").insert({
    organization_id: org.id,
    connector_id: connector.id,
    response_status_code: result.http_status,
    response_body: result.response_body_redacted,
    latency_ms: result.latency_ms || Date.now() - started,
    success: result.status === "accepted",
    error_message: result.error_message,
    request_body: JSON.stringify({ qentrax_test: true }),
  });

  revalidatePath(BASE);

  if (result.status === "accepted") {
    back(org.id, {
      id,
      notice: `Test lead accepted (${result.http_status}) in ${result.latency_ms}ms.`,
    });
  }
  back(org.id, {
    id,
    error: `Test lead failed: ${result.error_message ?? result.status} (${result.http_status ?? "no response"}).`,
  });
}
