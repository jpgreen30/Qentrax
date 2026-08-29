import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { getSimulationResults } from "@/lib/services/routing-simulator";

export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  try {
    const searchParams = request.nextUrl.searchParams;
    const organizationId = searchParams.get("organization_id");
    const simulationRunId = searchParams.get("simulation_run_id");
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!organizationId || !simulationRunId) {
      return Response.json(
        { success: false, message: "organization_id and simulation_run_id are required" },
        { status: 400 }
      );
    }

    const results = await getSimulationResults(
      supabase,
      simulationRunId,
      organizationId,
      limit,
      offset
    );

    return Response.json({ success: true, data: results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get simulation results";
    return Response.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
