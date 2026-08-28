import { createClient } from "@supabase/supabase-js";
import { apiOk, apiError } from "@/lib/api-utils";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data, error } = await supabase
      .from("connectors")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !data) {
      return apiError("Connector not found", 404);
    }

    return apiOk({ connector: data });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to get connector",
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const updateData: Record<string, unknown> = {};

    // Only update fields that were provided
    const allowedFields = [
      "name",
      "endpoint_url",
      "method",
      "headers",
      "auth_type",
      "auth_credential_ref",
      "request_format",
      "response_format",
      "ping_field_mapping",
      "timeout_ms",
      "status",
    ];

    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    const { data, error } = await supabase
      .from("connectors")
      .update(updateData)
      .eq("id", params.id)
      .select()
      .single();

    if (error) throw error;

    return apiOk({ connector: data });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to update connector",
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { error } = await supabase
      .from("connectors")
      .delete()
      .eq("id", params.id);

    if (error) throw error;

    return apiOk({ message: "Connector deleted" });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to delete connector",
    );
  }
}
