import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { grant_type, code, refresh_token, client_id } = body;

    if (grant_type === "authorization_code") {
      if (!code || !client_id) {
        return Response.json(
          { error: "invalid_request" },
          { status: 400 }
        );
      }

      // In production, verify authorization code was issued by this app
      // For now, create a simple JWT token
      const payload = {
        sub: client_id, // In production, decode the code to get user ID
        org_id: undefined, // Would be derived from authorization context
        aud: `${process.env.MCP_PUBLIC_URL || "https://mcp.qentrax.io"}/mcp`,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        typ: "access",
      };

      // Create simple JWT (unsigned for demo - sign with MCP_JWT_SECRET in production)
      const token = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64") +
        "." +
        Buffer.from(JSON.stringify(payload)).toString("base64") +
        "." +
        "signature";

      return Response.json({
        access_token: token,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: Buffer.from(JSON.stringify({ sub: payload.sub })).toString("base64"),
      });
    }

    if (grant_type === "refresh_token") {
      if (!refresh_token) {
        return Response.json(
          { error: "invalid_request" },
          { status: 400 }
        );
      }

      // Decode refresh token and issue new access token
      const decoded = JSON.parse(Buffer.from(refresh_token, "base64").toString());
      const payload = {
        sub: decoded.sub,
        aud: `${process.env.MCP_PUBLIC_URL || "https://mcp.qentrax.io"}/mcp`,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        typ: "access",
      };

      const token = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64") +
        "." +
        Buffer.from(JSON.stringify(payload)).toString("base64") +
        "." +
        "signature";

      return Response.json({
        access_token: token,
        token_type: "Bearer",
        expires_in: 3600,
      });
    }

    return Response.json(
      { error: "unsupported_grant_type" },
      { status: 400 }
    );
  } catch {
    return Response.json(
      { error: "server_error" },
      { status: 500 }
    );
  }
}
