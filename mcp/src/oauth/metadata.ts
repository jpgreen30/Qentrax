import { mcpResourceUrl, SCOPES } from "../lib/config.js";

export function protectedResourceMetadata(base: string) {
  const resource = mcpResourceUrl(base);
  return {
    resource,
    authorization_servers: [base],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://github.com/jpgreen30/Qentrax/blob/main/docs/MCP_PHASE1.md",
  };
}

export function authorizationServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    scopes_supported: [...SCOPES],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    client_id_metadata_document_supported: true,
    service_documentation: "https://github.com/jpgreen30/Qentrax/blob/main/docs/MCP_PHASE1.md",
  };
}

export function openidConfiguration(base: string) {
  return {
    ...authorizationServerMetadata(base),
    userinfo_endpoint: `${base}/oauth/userinfo`,
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["HS256"],
    claims_supported: ["sub", "email", "email_verified", "iss", "aud", "exp", "iat"],
  };
}

export function wwwAuthenticate(base: string, scope?: string): string {
  const meta = `${base}/.well-known/oauth-protected-resource`;
  const parts = [
    `Bearer realm="qentrax-mcp"`,
    `resource_metadata="${meta}"`,
  ];
  if (scope) parts.push(`scope="${scope}"`);
  return parts.join(", ");
}
