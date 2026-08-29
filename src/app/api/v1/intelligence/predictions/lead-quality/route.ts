import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { predictLeadQuality } from "@/lib/services/intelligence";

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  try {
    const body = await request.json();
    const { organization_id, lead_data } = body;

    if (!organization_id || !lead_data) {
      return Response.json(
        { success: false, message: "organization_id and lead_data are required" },
        { status: 400 }
      );
    }

    const prediction = await predictLeadQuality(supabase, organization_id, lead_data);

    return Response.json({ success: true, data: prediction });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to predict lead quality";
    return Response.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
