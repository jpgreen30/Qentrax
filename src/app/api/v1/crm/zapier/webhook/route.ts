import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  try {
    const integrationId = request.nextUrl.searchParams.get("integration_id");
    const organizationId = request.nextUrl.searchParams.get("organization_id");

    if (!integrationId || !organizationId) {
      return Response.json(
        {
          success: false,
          message: "integration_id and organization_id parameters required",
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    const { error } = await supabase
      .from("crm_sync_records")
      .upsert({
        integration_id: integrationId,
        external_id: body.id || body.email,
        email: body.email,
        data: body,
        synced_at: new Date().toISOString(),
      });

    if (error) {
      return Response.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    return Response.json(
      { success: true, message: "Contact received from Zapier" },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
