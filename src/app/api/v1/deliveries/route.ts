import { createClient } from "@supabase/supabase-js";
import { apiOk, apiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const transactionId = searchParams.get("transaction_id");
  const opportunityId = searchParams.get("opportunity_id");
  const status = searchParams.get("status");
  const organizationId = searchParams.get("organization_id");
  const limit = parseInt(searchParams.get("limit") || "100");
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    let query = supabase
      .from("deliveries")
      .select("*", { count: "exact" });

    if (transactionId) query = query.eq("transaction_id", transactionId);
    if (opportunityId) query = query.eq("opportunity_id", opportunityId);
    if (status) query = query.eq("status", status);
    if (organizationId) query = query.eq("organization_id", organizationId);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return apiOk({
      deliveries: data,
      count,
      offset,
      limit,
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to list deliveries",
    );
  }
}
