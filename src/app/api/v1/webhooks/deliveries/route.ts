import { createClient } from "@supabase/supabase-js";
import { apiOk, apiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organization_id");
  const webhookEndpointId = searchParams.get("webhook_endpoint_id");
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    let query = supabase
      .from("webhook_deliveries")
      .select(
        `*,
        webhook_endpoints(id, url, connector_id),
        webhook_events(event_type, transaction_id, organization_id)`,
        { count: "exact" },
      );

    if (organizationId) {
      query = query.eq("webhook_events.organization_id", organizationId);
    }

    if (webhookEndpointId) {
      query = query.eq("webhook_endpoint_id", webhookEndpointId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return apiOk({
      deliveries: data,
      count,
      total: count,
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to list webhook deliveries",
    );
  }
}
