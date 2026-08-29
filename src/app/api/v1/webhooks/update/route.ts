import { createClient } from "@supabase/supabase-js";
import { apiOk, apiError } from "@/lib/api-utils";
import { receiveWebhookUpdate } from "@/lib/services/webhooks";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id as string;
    const signature = request.headers.get("x-webhook-signature") || undefined;

    if (!organizationId) {
      return apiError("Missing required field: organization_id", 400);
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Get the connector's webhook secret if HMAC verification is needed
    let webhookSecret: string | undefined;
    if (signature) {
      const connectorId = body.connector_id as string;
      if (connectorId) {
        const { data: endpoint } = await supabase
          .from("webhook_endpoints")
          .select("auth_credential")
          .eq("connector_id", connectorId)
          .eq("organization_id", organizationId)
          .eq("auth_type", "hmac")
          .single();

        if (endpoint?.auth_credential) {
          webhookSecret = endpoint.auth_credential;
        }
      }
    }

    const result = await receiveWebhookUpdate(
      supabase,
      organizationId,
      body,
      signature,
      webhookSecret,
    );

    if (!result.success) {
      return apiError(result.message, 400);
    }

    return apiOk({ message: result.message });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to process webhook update",
    );
  }
}
