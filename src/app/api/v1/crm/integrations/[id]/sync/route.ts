import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import {
  syncCrmIntegration,
  syncHubSpotContacts,
  syncSftpCsv,
  type CrmIntegrationConfig,
} from "@/lib/services/crm-integrations";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  try {
    const { data: config, error: configError } = await supabase
      .from("crm_integrations")
      .select("*")
      .eq("id", params.id)
      .single();

    if (configError || !config) {
      return Response.json(
        { success: false, message: "CRM integration not found" },
        { status: 404 }
      );
    }

    let result;

    if (config.platform === "hubspot") {
      result = await syncHubSpotContacts(supabase, params.id, config);
    } else if (config.platform === "sftp") {
      const body = await request.json();
      if (!body.csvData) {
        return Response.json(
          { success: false, message: "csvData required for SFTP sync" },
          { status: 400 }
        );
      }
      result = await syncSftpCsv(supabase, params.id, config, body.csvData);
    } else {
      result = await syncCrmIntegration(supabase, params.id);
    }

    return Response.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
