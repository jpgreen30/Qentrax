import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { createSimulationScenario, listSimulationScenarios } from "@/lib/services/routing-simulator";

export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  try {
    const searchParams = request.nextUrl.searchParams;
    const organizationId = searchParams.get("organization_id");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!organizationId) {
      return Response.json(
        { success: false, message: "organization_id is required" },
        { status: 400 }
      );
    }

    const scenarios = await listSimulationScenarios(supabase, organizationId, limit, offset);

    return Response.json({ success: true, data: scenarios });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list simulation scenarios";
    return Response.json(
      { success: false, message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  try {
    const body = await request.json();
    const {
      organization_id,
      name,
      description,
      scenario_type,
      base_strategy,
      date_range_start,
      date_range_end,
      filters,
      what_if_parameters,
      created_by,
    } = body;

    if (!organization_id || !name || !scenario_type || !base_strategy) {
      return Response.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!["replay", "what_if"].includes(scenario_type)) {
      return Response.json(
        { success: false, message: "scenario_type must be 'replay' or 'what_if'" },
        { status: 400 }
      );
    }

    const scenario = await createSimulationScenario(supabase, organization_id, {
      name,
      description,
      scenario_type,
      base_strategy,
      date_range_start,
      date_range_end,
      filters,
      what_if_parameters,
      created_by: created_by || "api",
    });

    return Response.json({ success: true, data: scenario }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create simulation scenario";
    return Response.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
