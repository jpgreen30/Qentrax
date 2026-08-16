import { randomBytes } from "node:crypto";

export type RegisteredClient = {
  client_id: string;
  client_secret?: string;
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  created_at: number;
};

export type AuthCodeRecord = {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  resource?: string;
  user_id: string;
  email?: string;
  expires_at: number;
};

const clients = new Map<string, RegisteredClient>();
const authCodes = new Map<string, AuthCodeRecord>();

export function ensureClient(client: RegisteredClient): void {
  clients.set(client.client_id, client);
}

export function getClient(clientId: string): RegisteredClient | undefined {
  return clients.get(clientId);
}

export function registerClient(input: {
  client_name?: string;
  redirect_uris: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
}): RegisteredClient {
  const client_id = randomBytes(16).toString("hex");
  const client: RegisteredClient = {
    client_id,
    client_name: input.client_name ?? "mcp-client",
    redirect_uris: input.redirect_uris,
    grant_types: input.grant_types ?? ["authorization_code", "refresh_token"],
    response_types: input.response_types ?? ["code"],
    token_endpoint_auth_method: input.token_endpoint_auth_method ?? "none",
    created_at: Date.now(),
  };
  clients.set(client_id, client);
  return client;
}

export function saveAuthCode(rec: AuthCodeRecord): void {
  authCodes.set(rec.code, rec);
}

export function consumeAuthCode(code: string): AuthCodeRecord | undefined {
  const rec = authCodes.get(code);
  if (!rec) return undefined;
  authCodes.delete(code);
  if (rec.expires_at < Date.now()) return undefined;
  return rec;
}

export function isRedirectAllowed(client: RegisteredClient, uri: string): boolean {
  if (client.redirect_uris.includes(uri)) return true;
  if (
    uri.startsWith("https://chatgpt.com/connector/oauth/") ||
    uri === "https://chatgpt.com/connector_platform_oauth_redirect" ||
    uri.startsWith("https://chat.openai.com/connector/oauth/")
  ) {
    return true;
  }
  return false;
}
