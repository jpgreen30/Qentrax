import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { compareRoutingStrategies } from "@/lib/services/routing-simulator";

export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  try {
    const searchParams = request.nextUrl.searchParams;
    const organizationId = searchParams.get("organization_id");
    const strategyA = searchParams.get("strategy_a");
    const strategyB = searchParams.get("strategy_b");
    const dateRangeStart = searchParams.get("date_range_start");
    const dateRangeEnd = searchParams.get("date_range_end");

    if (!organizationId || !strategyA || !strategyB || !dateRangeStart || !dateRangeEnd) {
      return Response.json(
        {
          success: false,
          message: "organization_id, strategy_a, strategy_b, date_range_start, and date_range_end are required",
        },
        { status: 400 }
      );
    }

    const comparison = await compareRoutingStrategies(
      supabase,
      organizationId,
      strategyA,
      strategyB,
      dateRangeStart,
      dateRangeEnd
    );

    return Response.json({ success: true, data: comparison });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to compare routing strategies";
    return Response.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
