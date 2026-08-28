import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { syncSftpCsv } from "@/lib/services/crm-integrations";

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  try {
    const integrationId = request.nextUrl.searchParams.get("integration_id");

    if (!integrationId) {
      return Response.json(
        { success: false, message: "integration_id parameter required" },
        { status: 400 }
      );
    }

    const { data: config, error: configError } = await supabase
      .from("crm_integrations")
      .select("*")
      .eq("id", integrationId)
      .single();

    if (configError || !config) {
      return Response.json(
        { success: false, message: "CRM integration not found" },
        { status: 404 }
      );
    }

    if (config.platform !== "sftp") {
      return Response.json(
        { success: false, message: "Integration is not SFTP type" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json(
        { success: false, message: "File is required" },
        { status: 400 }
      );
    }

    const csvData = await file.text();
    const result = await syncSftpCsv(supabase, integrationId, config, csvData);

    return Response.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
