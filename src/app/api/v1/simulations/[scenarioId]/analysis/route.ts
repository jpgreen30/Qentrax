import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { getSimulationAnalysis } from "@/lib/services/routing-simulator";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scenarioId: string }> }
) {
  const { scenarioId } = await params;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  try {
    const searchParams = request.nextUrl.searchParams;
    const organizationId = searchParams.get("organization_id");

    if (!organizationId) {
      return Response.json(
        { success: false, message: "organization_id is required" },
        { status: 400 }
      );
    }

    const analysis = await getSimulationAnalysis(
      supabase,
      scenarioId,
      organizationId
    );

    return Response.json({ success: true, data: analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get simulation analysis";
    return Response.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
