import { createAdminClient } from "@/lib/supabase/admin";
import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { requestId } from "@/lib/request-id";
import { requireAdvertiserCrmAccess } from "@/lib/services/crm-access";
import { createClient } from "@/lib/supabase/server";
import {
  syncCrmIntegration,
  syncHubSpotContacts,
  syncSftpCsv,
} from "@/lib/services/crm-integrations";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const request_id = requestId(request.headers.get("x-request-id"));
  const { id } = await params;
  const supabase = await createClient();

  try {
    const { data: config, error: configError } = await supabase
      .from("crm_integrations")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (configError || !config) {
      return apiError("NOT_FOUND", "CRM integration not found.", request_id, 404);
    }

    const access = await requireAdvertiserCrmAccess(config.organization_id as string, {
      supabase,
    });
    if (!access.ok) {
      return apiError(access.code, access.message, request_id, access.code === "AUTH_REQUIRED" ? 401 : 403);
    }

    const admin = createAdminClient();
    let result;

    if (config.platform === "hubspot") {
      result = await syncHubSpotContacts(admin, id, config);
    } else if (config.platform === "sftp") {
      const body = await request.json();
      if (!body.csvData) {
        return apiError("VALIDATION_ERROR", "csvData required for SFTP sync.", request_id, 400);
      }
      result = await syncSftpCsv(admin, id, config, body.csvData);
    } else {
      result = await syncCrmIntegration(admin, id);
    }

    return Response.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError("INTERNAL_ERROR", message, request_id, 500);
  }
}
