import { createClient } from "@supabase/supabase-js";
import { apiOk, apiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const connectorId = searchParams.get("connector_id");
  const verticalId = searchParams.get("vertical_id");
  const organizationId = searchParams.get("organization_id");

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    let query = supabase
      .from("connector_verticals")
      .select("*, connectors(*), verticals(*)");

    if (connectorId) query = query.eq("connector_id", connectorId);
    if (verticalId) query = query.eq("vertical_id", verticalId);
    if (organizationId) query = query.eq("organization_id", organizationId);

    const { data, error } = await query;

    if (error) throw error;

    return apiOk({
      mappings: data,
      count: (data || []).length,
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to list connector-verticals",
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    const requiredFields = [
      "connector_id",
      "vertical_id",
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
      .from("connector_verticals")
      .insert({
        connector_id: body.connector_id,
        vertical_id: body.vertical_id,
        organization_id: body.organization_id,
        enabled: body.enabled !== false,
        priority: body.priority || 0,
        weight: body.weight || 1,
      })
      .select()
      .single();

    if (error) throw error;

    return apiOk({ mapping: data }, 201);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to create connector-vertical mapping",
    );
  }
}
