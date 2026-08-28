import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
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
    // In production, verify against MCP_JWT_SECRET
    // For now, simple base64 decode (unsafe - for demo only)
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
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
