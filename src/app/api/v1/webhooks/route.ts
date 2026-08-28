import { createClient } from "@supabase/supabase-js";
import { apiOk, apiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const connectorId = searchParams.get("connector_id");
  const organizationId = searchParams.get("organization_id");

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    let query = supabase
      .from("webhook_endpoints")
      .select("*");

    if (connectorId) query = query.eq("connector_id", connectorId);
    if (organizationId) query = query.eq("organization_id", organizationId);

    const { data, error } = await query;

    if (error) throw error;

    return apiOk({
      endpoints: data,
      count: (data || []).length,
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to list webhooks",
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    const requiredFields = [
      "connector_id",
      "organization_id",
      "url",
      "events",
    ];
    for (const field of requiredFields) {
      if (!body[field]) {
        return apiError(`Missing required field: ${field}`, 400);
      }
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data, error } = await supabase
      .from("webhook_endpoints")
      .insert({
        connector_id: body.connector_id,
        organization_id: body.organization_id,
        url: body.url,
        auth_type: body.auth_type || "none",
        auth_credential: body.auth_credential,
        events: body.events,
        active: body.active !== false,
      })
      .select()
      .single();

    if (error) throw error;

    return apiOk({ endpoint: data }, 201);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to create webhook",
    );
  }
}
