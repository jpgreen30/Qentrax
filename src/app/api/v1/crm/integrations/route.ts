import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { CrmIntegrationConfig } from "@/lib/services/crm-integrations";

export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  const organizationId = request.nextUrl.searchParams.get("organization_id");

  if (!organizationId) {
    return Response.json(
      { success: false, message: "organization_id parameter required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("crm_integrations")
    .select("*")
    .eq("organization_id", organizationId);

  if (error) {
    return Response.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    data: data || [],
    count: (data || []).length,
  });
}

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  const body = await request.json();
  const {
    organization_id,
    platform,
    name,
    credentials,
    mapped_fields,
    sync_enabled,
    sync_frequency_minutes,
  } = body;

  if (
    !organization_id ||
    !platform ||
    !name ||
    !credentials ||
    !mapped_fields
  ) {
    return Response.json(
      {
        success: false,
        message:
          "Missing required fields: organization_id, platform, name, credentials, mapped_fields",
      },
      { status: 400 }
    );
  }

  const newConfig: CrmIntegrationConfig = {
    id: crypto.randomUUID(),
    organization_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    platform: platform as any,
    name,
    status: "disconnected",
    credentials,
    mapped_fields,
    sync_enabled: sync_enabled ?? false,
    sync_frequency_minutes: sync_frequency_minutes ?? 60,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("crm_integrations")
    .insert([newConfig]);

  if (error) {
    return Response.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }

  return Response.json({ success: true, data: newConfig }, { status: 201 });
}
