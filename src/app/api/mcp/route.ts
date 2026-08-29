import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import * as crypto from "crypto";
import {
  validateMCPToolAccess,
  submitOpportunityViaMCP,
  updateCampaignViaMCP,
  reportConversionViaMCP,
  getOrganizationContext,
  type MCPToolCall,
} from "@/lib/services/mcp-tools";

function verifyJWT(token: string): { sub: string; org_id?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const jwtSecret = process.env.MCP_JWT_SECRET;
    if (jwtSecret) {
      const signature = parts[2];
      const message = `${parts[0]}.${parts[1]}`;
      const expectedSignature = crypto
        .createHmac("sha256", jwtSecret)
        .update(message)
        .digest("base64url");
      if (signature !== expectedSignature) {
        return null; // Invalid signature
      }
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());

    // Verify required claims
    if (!payload.sub || typeof payload.sub !== "string") {
      return null;
    }

    // Check expiration if present
    if (payload.exp && typeof payload.exp === "number") {
      if (Date.now() >= payload.exp * 1000) {
        return null; // Token expired
      }
    }

    return { sub: payload.sub, org_id: payload.org_id };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  try {
    // Extract bearer token
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return Response.json(
        { success: false, error: "Missing or invalid Authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    const decoded = verifyJWT(token);
    if (!decoded) {
      return Response.json(
        { success: false, error: "Invalid token" },
        { status: 401 }
      );
    }

    // Get organization context
    const context = await getOrganizationContext(supabase, decoded.sub, decoded.org_id);
    if (!context) {
      return Response.json(
        { success: false, error: "Organization context not found" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { tool, params } = body as MCPToolCall;

    // Validate access to tool
    const accessCheck = await validateMCPToolAccess(supabase, context, tool);
    if (!accessCheck.allowed) {
      return Response.json(
        { success: false, error: accessCheck.reason },
        { status: 403 }
      );
    }

    let result;

    switch (tool) {
      case "submit_opportunity":
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result = await submitOpportunityViaMCP(supabase, context, params as any);
        break;

      case "update_campaign":
        result = await updateCampaignViaMCP(
          supabase,
          context,
          params.campaign_id as string,
          params.updates as Record<string, unknown>
        );
        break;

      case "report_conversion":
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result = await reportConversionViaMCP(supabase, context, params as any);
        break;

      default:
        return Response.json(
          { success: false, error: `Unknown tool: ${tool}` },
          { status: 400 }
        );
    }

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
