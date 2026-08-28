import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { getConnectorMetrics } from "@/lib/services/conversion-tracking";

export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  const organizationId = request.nextUrl.searchParams.get("organization_id");
  const connectorId = request.nextUrl.searchParams.get("connector_id");
  const startDate = request.nextUrl.searchParams.get("start_date");
  const endDate = request.nextUrl.searchParams.get("end_date");

  if (!organizationId || !connectorId || !startDate || !endDate) {
    return Response.json(
      {
        success: false,
        message: "organization_id, connector_id, start_date, and end_date parameters required",
      },
      { status: 400 }
    );
  }

  try {
    const metrics = await getConnectorMetrics(
      supabase,
      organizationId,
      connectorId,
      startDate,
      endDate
    );

    return Response.json({ success: true, data: metrics });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
