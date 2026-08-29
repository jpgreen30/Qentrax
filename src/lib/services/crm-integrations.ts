import type { SupabaseClient } from "@supabase/supabase-js";

export type CrmPlatform = "hubspot" | "zapier" | "make" | "sftp";

export type CrmIntegrationConfig = {
  id: string;
  organization_id: string;
  platform: CrmPlatform;
  name: string;
  status: "connected" | "disconnected" | "error";
  api_key?: string;
  api_url?: string;
  credentials: Record<string, unknown>;
  mapped_fields: FieldMapping;
  sync_enabled: boolean;
  sync_frequency_minutes: number;
  last_sync_at?: string;
  created_at: string;
  updated_at: string;
};

export type FieldMapping = {
  [qentraxField: string]: string; // Maps Qentrax field to external field
};

export type CrmContact = {
  id: string;
  external_id?: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  custom_fields?: Record<string, unknown>;
};

export type CrmSyncResult = {
  success: boolean;
  platform: CrmPlatform;
  records_synced: number;
  records_failed: number;
  error_message?: string;
  synced_at: string;
};

// HubSpot Integration
export async function syncHubSpotContacts(
  supabase: SupabaseClient,
  integrationId: string,
  config: CrmIntegrationConfig,
): Promise<CrmSyncResult> {
  let recordsSynced = 0;
  let recordsFailed = 0;

  try {
    if (!config.credentials.apiKey) {
      throw new Error("HubSpot API key not configured");
    }

    const apiKey = config.credentials.apiKey as string;
    const baseUrl = "https://api.hubapi.com";

    // Fetch contacts from HubSpot
    const response = await fetch(`${baseUrl}/crm/v3/objects/contacts`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HubSpot API error: ${response.statusText}`);
    }

    const data = await response.json();
    const contacts = data.results || [];

    // Map and store contacts
    for (const contact of contacts) {
      try {
        const mapped = mapHubSpotContact(contact, config.mapped_fields);

        const { error } = await supabase
          .from("crm_sync_records")
          .upsert({
            integration_id: integrationId,
            external_id: contact.id,
            email: mapped.email,
            data: mapped,
            synced_at: new Date().toISOString(),
          });

        if (error) {
          recordsFailed++;
        } else {
          recordsSynced++;
        }
      } catch {
        recordsFailed++;
      }
    }

    // Update integration last sync time
    await supabase
      .from("crm_integrations")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", integrationId);

    return {
      success: true,
      platform: "hubspot",
      records_synced: recordsSynced,
      records_failed: recordsFailed,
      synced_at: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      platform: "hubspot",
      records_synced: recordsSynced,
      records_failed: recordsFailed,
      error_message: errorMessage,
      synced_at: new Date().toISOString(),
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapHubSpotContact(hubspotContact: any, _fieldMapping: FieldMapping): CrmContact {
  const properties = hubspotContact.properties || {};

  return {
    id: hubspotContact.id,
    external_id: hubspotContact.id,
    email: properties.email?.value || "",
    first_name: properties.firstname?.value,
    last_name: properties.lastname?.value,
    phone: properties.phone?.value,
    company: properties.company?.value,
    address: properties.address?.value,
    city: properties.city?.value,
    state: properties.state?.value,
    zip: properties.zip?.value,
    country: properties.country?.value,
    custom_fields: properties,
  };
}

// Zapier Integration
export async function setupZapierWebhook(
  supabase: SupabaseClient,
  integrationId: string,
  config: CrmIntegrationConfig,
): Promise<{ success: boolean; webhook_url: string; error?: string }> {
  try {
    if (!config.credentials.webhookUrl) {
      throw new Error("Zapier webhook URL not configured");
    }

    // Zapier uses webhook-based integrations
    // Store the webhook URL in the integration config
    const { error } = await supabase
      .from("crm_integrations")
      .update({
        credentials: {
          ...config.credentials,
          webhookConfigured: true,
        },
      })
      .eq("id", integrationId);

    if (error) throw error;

    return {
      success: true,
      webhook_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://qentrax.app"}/api/v1/crm/zapier/webhook`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      webhook_url: "",
      error: errorMessage,
    };
  }
}

// Make Integration
export async function setupMakeScenario(
  supabase: SupabaseClient,
  integrationId: string,
  config: CrmIntegrationConfig,
): Promise<{ success: boolean; webhook_url: string; error?: string }> {
  try {
    if (!config.credentials.accountId) {
      throw new Error("Make account ID not configured");
    }

    // Make uses webhook-based scenarios
    // Return the webhook URL for the user to configure in Make
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://qentrax.app"}/api/v1/crm/make/webhook`;

    const { error } = await supabase
      .from("crm_integrations")
      .update({
        credentials: {
          ...config.credentials,
          webhookConfigured: true,
        },
      })
      .eq("id", integrationId);

    if (error) throw error;

    return {
      success: true,
      webhook_url: webhookUrl,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      webhook_url: "",
      error: errorMessage,
    };
  }
}

// SFTP Integration
export async function syncSftpCsv(
  supabase: SupabaseClient,
  integrationId: string,
  config: CrmIntegrationConfig,
  csvData: string,
): Promise<CrmSyncResult> {
  let recordsSynced = 0;
  let recordsFailed = 0;

  try {
    if (!csvData) {
      throw new Error("No CSV data provided");
    }

    // Parse CSV
    const lines = csvData.trim().split("\n");
    if (lines.length < 2) {
      throw new Error("CSV must contain header and data rows");
    }

    const headers = lines[0].split(",").map((h) => h.trim());
    const emailIndex = headers.indexOf("email");

    if (emailIndex === -1) {
      throw new Error("CSV must contain 'email' column");
    }

    // Process rows
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(",").map((v) => v.trim());
        const contact: CrmContact = {
          id: `sftp_${integrationId}_${i}`,
          external_id: values[emailIndex],
          email: values[emailIndex],
          first_name: values[headers.indexOf("first_name")] || undefined,
          last_name: values[headers.indexOf("last_name")] || undefined,
          phone: values[headers.indexOf("phone")] || undefined,
          company: values[headers.indexOf("company")] || undefined,
        };

        const { error } = await supabase
          .from("crm_sync_records")
          .upsert({
            integration_id: integrationId,
            external_id: contact.email,
            email: contact.email,
            data: contact,
            synced_at: new Date().toISOString(),
          });

        if (error) {
          recordsFailed++;
        } else {
          recordsSynced++;
        }
      } catch {
        recordsFailed++;
      }
    }

    // Update integration last sync time
    await supabase
      .from("crm_integrations")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", integrationId);

    return {
      success: true,
      platform: "sftp",
      records_synced: recordsSynced,
      records_failed: recordsFailed,
      synced_at: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      platform: "sftp",
      records_synced: recordsSynced,
      records_failed: recordsFailed,
      error_message: errorMessage,
      synced_at: new Date().toISOString(),
    };
  }
}

// Generic CRM sync handler
export async function syncCrmIntegration(
  supabase: SupabaseClient,
  integrationId: string,
): Promise<CrmSyncResult> {
  try {
    const { data: config, error: configError } = await supabase
      .from("crm_integrations")
      .select("*")
      .eq("id", integrationId)
      .single();

    if (configError || !config) {
      throw new Error("CRM integration not found");
    }

    if (!config.sync_enabled) {
      return {
        success: false,
        platform: config.platform,
        records_synced: 0,
        records_failed: 0,
        error_message: "Sync disabled",
        synced_at: new Date().toISOString(),
      };
    }

    switch (config.platform) {
      case "hubspot":
        return await syncHubSpotContacts(supabase, integrationId, config);
      case "sftp":
        return {
          success: false,
          platform: "sftp",
          records_synced: 0,
          records_failed: 0,
          error_message: "SFTP requires manual upload",
          synced_at: new Date().toISOString(),
        };
      case "zapier":
      case "make":
        return {
          success: false,
          platform: config.platform,
          records_synced: 0,
          records_failed: 0,
          error_message: "Webhook-based integration, no periodic sync",
          synced_at: new Date().toISOString(),
        };
      default:
        throw new Error(`Unsupported platform: ${config.platform}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      platform: "hubspot",
      records_synced: 0,
      records_failed: 0,
      error_message: errorMessage,
      synced_at: new Date().toISOString(),
    };
  }
}

// Verify CRM connection
export async function verifyCrmConnection(
  config: CrmIntegrationConfig,
): Promise<{ connected: boolean; error?: string }> {
  try {
    switch (config.platform) {
      case "hubspot":
        if (!config.credentials.apiKey) {
          return { connected: false, error: "API key not configured" };
        }

        const response = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${config.credentials.apiKey}`,
          },
        });

        return {
          connected: response.ok,
          error: response.ok ? undefined : response.statusText,
        };

      case "zapier":
      case "make":
        return { connected: true }; // Webhook-based, always available

      case "sftp":
        return { connected: true }; // Manual upload

      default:
        return { connected: false, error: "Unknown platform" };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { connected: false, error: message };
  }
}
