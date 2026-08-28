import { createClient } from "@supabase/supabase-js";
import { apiOk, apiError } from "@/lib/api-utils";
import { requestReturn, approveReturn } from "@/lib/services/returns";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organization_id");
  const status = searchParams.get("status") || "pending";
  const limit = parseInt(searchParams.get("limit") || "50");

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    let query = supabase
      .from("return_requests")
      .select("*", { count: "exact" });

    if (organizationId) query = query.eq("organization_id", organizationId);
    if (status) query = query.eq("status", status);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return apiOk({
      returns: data,
      count,
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to list returns",
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    const requiredFields = ["transaction_id", "reason_code", "requested_by_org_id"];
    for (const field of requiredFields) {
      if (!body[field]) {
        return apiError(`Missing required field: ${field}`, 400);
      }
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const result = await requestReturn(supabase, {
      transaction_id: body.transaction_id,
      delivery_id: body.delivery_id,
      reason_code: body.reason_code,
      reason_text: body.reason_text,
      requested_by_org_id: body.requested_by_org_id,
    });

    return apiOk({ return_request: result }, 201);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to create return request",
    );
  }
}
