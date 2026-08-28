import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { forecastRevenue } from "@/lib/services/intelligence";

export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  try {
    const searchParams = request.nextUrl.searchParams;
    const organizationId = searchParams.get("organization_id");
    const forecastDays = parseInt(searchParams.get("forecast_days") || "30");

    if (!organizationId) {
      return Response.json(
        { success: false, message: "organization_id is required" },
        { status: 400 }
      );
    }

    const prediction = await forecastRevenue(supabase, organizationId, forecastDays);

    return Response.json({ success: true, data: prediction });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to forecast revenue";
    return Response.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
