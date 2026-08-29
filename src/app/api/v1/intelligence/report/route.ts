import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { generateIntelligenceReport } from "@/lib/services/intelligence";

export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  try {
    const searchParams = request.nextUrl.searchParams;
    const organizationId = searchParams.get("organization_id");
    const lookbackDays = parseInt(searchParams.get("lookback_days") || "30");

    if (!organizationId) {
      return Response.json(
        { success: false, message: "organization_id is required" },
        { status: 400 }
      );
    }

    const report = await generateIntelligenceReport(supabase, organizationId, lookbackDays);

    return Response.json({ success: true, data: report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate intelligence report";
    return Response.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
