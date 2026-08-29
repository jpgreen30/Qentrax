import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { detectAnomalies } from "@/lib/services/intelligence";

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  try {
    const body = await request.json();
    const { organization_id, lookback_days = 7 } = body;

    if (!organization_id) {
      return Response.json(
        { success: false, message: "organization_id is required" },
        { status: 400 }
      );
    }

    const anomalies = await detectAnomalies(supabase, organization_id, lookback_days);

    return Response.json({ success: true, data: anomalies });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to detect anomalies";
    return Response.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
