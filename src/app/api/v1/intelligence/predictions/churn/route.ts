import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { predictChurnRisk } from "@/lib/services/intelligence";

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  try {
    const body = await request.json();
    const { organization_id, entity_type, entity_id } = body;

    if (!organization_id || !entity_type || !entity_id) {
      return Response.json(
        { success: false, message: "organization_id, entity_type, and entity_id are required" },
        { status: 400 }
      );
    }

    if (!["advertiser", "publisher"].includes(entity_type)) {
      return Response.json(
        { success: false, message: "entity_type must be 'advertiser' or 'publisher'" },
        { status: 400 }
      );
    }

    const prediction = await predictChurnRisk(supabase, organization_id, entity_type, entity_id);

    return Response.json({ success: true, data: prediction });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to predict churn risk";
    return Response.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
