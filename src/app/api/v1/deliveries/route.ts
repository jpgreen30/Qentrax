import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
import { deliverToEndpoint } from "@/lib/delivery/http-delivery";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/deliveries
 * Body: { organization_id, transaction_id?, opportunity_id?, endpoint_url?, simulate?: boolean }
 * Resolves campaign endpoint (or override URL) and POSTs a redacted delivery payload.
 */
export async function POST(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const auth = await requireAuthContext();
  if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  let body: {
    organization_id?: string;
    transaction_id?: string;
    opportunity_id?: string;
    endpoint_url?: string;
    simulate?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body.", id, 400);
  }

  if (!body.organization_id) {
    return apiError("VALIDATION_ERROR", "organization_id is required.", id, 400);
  }
  if (!body.transaction_id && !body.opportunity_id) {
    return apiError(
      "VALIDATION_ERROR",
      "transaction_id or opportunity_id is required.",
      id,
      400,
    );
  }

  const supabase = await createClient();

  let txn: {
    id: string;
    opportunity_id: string | null;
    campaign_id: string | null;
    advertiser_price_cents: number | null;
    status: string;
  } | null = null;

  if (body.transaction_id) {
    const { data } = await supabase
      .from("transactions")
      .select("id, opportunity_id, campaign_id, advertiser_price_cents, status")
      .eq("id", body.transaction_id)
      .eq("advertiser_org_id", body.organization_id)
      .maybeSingle();
    txn = data;
  } else if (body.opportunity_id) {
    const { data } = await supabase
      .from("transactions")
      .select("id, opportunity_id, campaign_id, advertiser_price_cents, status")
      .eq("opportunity_id", body.opportunity_id)
      .eq("advertiser_org_id", body.organization_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    txn = data;
  }

  if (!txn) {
    return apiError("NOT_FOUND", "Transaction not found for this organization.", id, 404);
  }

  let endpointUrl = (body.endpoint_url ?? "").trim() || null;
  let endpointId: string | null = null;
  let timeoutMs = 8000;

  if (!endpointUrl && txn.campaign_id) {
    const { data: ep } = await supabase
      .from("campaign_endpoints")
      .select("id, endpoint_url, timeout_ms, status")
      .eq("campaign_id", txn.campaign_id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ep?.endpoint_url) {
      endpointUrl = ep.endpoint_url;
      endpointId = ep.id;
      if (ep.timeout_ms && Number.isFinite(ep.timeout_ms)) timeoutMs = Number(ep.timeout_ms);
    }
  }

  let publicTxn: string | undefined;
  let ping: Record<string, unknown> = {};
  if (txn.opportunity_id) {
    const { data: opp } = await supabase
      .from("opportunities")
      .select("public_transaction_id, ping_attributes")
      .eq("id", txn.opportunity_id)
      .maybeSingle();
    publicTxn = opp?.public_transaction_id ?? undefined;
    ping = (opp?.ping_attributes as Record<string, unknown>) ?? {};
  }

  const result = await deliverToEndpoint({
    endpointUrl,
    timeoutMs,
    simulateOnMissing: body.simulate !== false,
    payload: {
      transaction_id: txn.id,
      public_transaction_id: publicTxn,
      opportunity_id: txn.opportunity_id ?? "",
      campaign_id: txn.campaign_id ?? "",
      state:
        typeof ping.state === "string"
          ? ping.state
          : typeof ping.State === "string"
            ? String(ping.State)
            : null,
      attributes: ping,
      advertiser_price_cents: txn.advertiser_price_cents,
      delivered_at: new Date().toISOString(),
    },
  });

  if (txn.opportunity_id && txn.campaign_id) {
    try {
      await supabase.from("deliveries").insert({
        opportunity_id: txn.opportunity_id,
        campaign_id: txn.campaign_id,
        endpoint_id: endpointId,
        attempt_number: 1,
        status: result.status,
        request_id: id,
        response_code: result.http_status,
        latency_ms: result.latency_ms,
        response_snapshot_redacted: result.response_body_redacted
          ? { body: result.response_body_redacted, mode: result.mode }
          : { mode: result.mode },
        delivered_at: result.status === "accepted" ? new Date().toISOString() : null,
      });
    } catch {
      // table may not exist until migration is applied
    }
  }

  return apiOk(
    {
      transaction_id: txn.id,
      delivery: result,
    },
    id,
    result.status === "accepted" ? 200 : 502,
  );
}
