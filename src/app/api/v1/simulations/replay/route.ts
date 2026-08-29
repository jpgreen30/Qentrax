import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { runHistoricalReplay } from "@/lib/services/routing-simulator";

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  try {
    const body = await request.json();
    const { organization_id, scenario_id } = body;

    if (!organization_id || !scenario_id) {
      return Response.json(
        { success: false, message: "organization_id and scenario_id are required" },
        { status: 400 }
      );
    }

    const result = await runHistoricalReplay(supabase, scenario_id, organization_id);

    return Response.json(
      { success: true, data: result },
      { status: 202 } // Accepted - processing in background
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start historical replay";
    return Response.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
