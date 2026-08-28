import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { createHmac } from "crypto";

const JWT_SECRET = process.env.MCP_JWT_SECRET || "";

function verifyJwt(token: string, secret: string): any {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const [header64, payload64, signature64] = parts;

  // Verify signature
  const message = `${header64}.${payload64}`;
  const expectedSig = createHmac("sha256", secret)
    .update(message)
    .digest("base64url");

  if (signature64 !== expectedSig) {
    throw new Error("Invalid JWT signature");
  }

  // Decode payload
  const payload = JSON.parse(
    Buffer.from(payload64, "base64url").toString("utf-8")
  );

  return payload;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return Response.json(
      { error: "invalid_token", error_description: "Missing or invalid Bearer token" },
      { status: 401 }
    );
  }

  const token = authHeader.substring(7);

  try {
    const decoded = verifyJwt(token, JWT_SECRET);

    if (decoded.typ !== "access") {
      return Response.json(
        { error: "invalid_token", error_description: "Token is not an access token" },
        { status: 401 }
      );
    }

    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return Response.json(
        { error: "invalid_token", error_description: "Token has expired" },
        { status: 401 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    );

    // Fetch user info from Supabase
    const { data, error } = await supabase.auth.admin.getUserById(decoded.sub as string);

    if (error || !data?.user) {
      return Response.json(
        { error: "invalid_token", error_description: "User not found" },
        { status: 401 }
      );
    }

    const user = data.user;
    return Response.json({
      sub: user.id,
      email: user.email,
      email_verified: user.email_confirmed_at ? true : false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Userinfo failed";
    return Response.json(
      { error: "server_error", error_description: message },
      { status: 500 }
    );
  }
}
