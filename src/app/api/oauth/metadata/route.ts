import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.MCP_PUBLIC_URL || "https://mcp.qentrax.io";

  const metadata = {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    userinfo_endpoint: `${baseUrl}/api/oauth/userinfo`,
    registration_endpoint: `${baseUrl}/api/oauth/register`,
    scopes_supported: [
      "openid",
      "email",
      "profile",
      "offline_access",
      "qentrax:demand:read",
      "qentrax:requirements:read",
      "qentrax:opportunity:preflight",
      "qentrax:performance:read",
      "qentrax:opportunity:write",
      "qentrax:campaign:write",
      "qentrax:conversion:write",
    ],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["HS256"],
  };

  return Response.json(metadata);
}
