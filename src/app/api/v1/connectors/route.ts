import { createClient } from "@supabase/supabase-js";
import { apiOk, apiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const verticalId = searchParams.get("vertical_id");

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    let query = supabase.from("connectors").select("*");

    if (verticalId) {
      query = query.eq("vertical_id", verticalId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return apiOk({
      connectors: data,
      count: (data || []).length,
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to list connectors",
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    const requiredFields = [
      "name",
      "connector_type",
      "endpoint_url",
      "organization_id",
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
      .from("connectors")
      .insert({
        name: body.name,
        connector_type: body.connector_type,
        endpoint_url: body.endpoint_url,
        organization_id: body.organization_id,
        method: body.method || "POST",
        headers: body.headers || {},
        auth_type: body.auth_type || "none",
        auth_credential_ref: body.auth_credential_ref,
        request_format: body.request_format || "json",
        response_format: body.response_format || "json",
        ping_field_mapping: body.ping_field_mapping || {},
        timeout_ms: body.timeout_ms || 5000,
        status: body.status || "testing",
      })
      .select()
      .single();

    if (error) throw error;

    return apiOk({ connector: data }, 201);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to create connector",
    );
  }
}
