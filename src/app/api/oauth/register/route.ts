import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";

const MCP_PUBLIC_URL = process.env.MCP_PUBLIC_URL || "https://mcp.qentrax.io";

function generateClientId(): string {
  return `client_${randomBytes(16).toString("hex")}`;
}

function generateClientSecret(): string {
  return randomBytes(32).toString("hex");
}

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  try {
    const body = await request.json();

    const {
      redirect_uris,
      client_name,
      contacts,
      logo_uri,
      application_type,
      grant_types,
      response_types,
      default_max_age,
      subject_type,
    } = body;

    if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      return Response.json(
        { error: "invalid_request", error_description: "redirect_uris is required and must be an array" },
        { status: 400 }
      );
    }

    // Validate redirect URIs are HTTPS (except localhost)
    for (const uri of redirect_uris) {
      const url = new URL(uri);
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        return Response.json(
          { error: "invalid_request", error_description: "Redirect URIs must use HTTPS" },
          { status: 400 }
        );
      }
    }

    const clientId = generateClientId();
    const clientSecret = generateClientSecret();

    // Store client registration
    const { error } = await supabase.from("oauth_clients").insert([
      {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uris: redirect_uris,
        client_name: client_name || "Untitled Client",
        contacts: contacts || [],
        logo_uri: logo_uri || null,
        application_type: application_type || "web",
        grant_types: grant_types || ["authorization_code", "refresh_token"],
        response_types: response_types || ["code"],
        default_max_age: default_max_age || null,
        subject_type: subject_type || "public",
      },
    ]);

    if (error) {
      return Response.json(
        { error: "invalid_request", error_description: error.message },
        { status: 400 }
      );
    }

    return Response.json(
      {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uris: redirect_uris,
        client_name: client_name || "Untitled Client",
        contacts: contacts || [],
        logo_uri: logo_uri || null,
        application_type: application_type || "web",
        grant_types: grant_types || ["authorization_code", "refresh_token"],
        response_types: response_types || ["code"],
        default_max_age: default_max_age || null,
        subject_type: subject_type || "public",
        client_id_issued_at: Math.floor(Date.now() / 1000),
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    return Response.json(
      { error: "server_error", error_description: message },
      { status: 500 }
    );
  }
}
