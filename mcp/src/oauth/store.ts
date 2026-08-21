import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  nonce?: string;
  user_id: string;
  email?: string;
  expires_at: number;
};

const clients = new Map<string, RegisteredClient>();
const authCodes = new Map<string, AuthCodeRecord>();
const revokedJtis = new Map<string, number>();
let database: SupabaseClient | null | undefined;

function db(): SupabaseClient | null {
  if (database !== undefined) return database;
  if (process.env.NODE_ENV === "test" || process.argv.includes("--test")) {
    database = null;
    return database;
  }
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  database =
    url && key
      ? createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  return database;
}

function codeHash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function getClient(
  clientId: string,
): Promise<RegisteredClient | undefined> {
  const cached = clients.get(clientId);
  if (cached) return cached;
  const database = db();
  if (!database) return undefined;
  const { data, error } = await database.rpc("oauth_get_client", {
    p_client_id: clientId,
  });
  if (error) throw error;
  const client = data as RegisteredClient | undefined;
  if (client) clients.set(client.client_id, client);
  return client;
}

export async function registerClient(input: {
  client_name?: string;
  redirect_uris: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
}): Promise<RegisteredClient> {
  const client: RegisteredClient = {
    client_id: randomBytes(16).toString("hex"),
    client_name: input.client_name ?? "mcp-client",
    redirect_uris: input.redirect_uris,
    grant_types: input.grant_types ?? ["authorization_code", "refresh_token"],
    response_types: input.response_types ?? ["code"],
    token_endpoint_auth_method: input.token_endpoint_auth_method ?? "none",
    created_at: Date.now(),
  };
  clients.set(client.client_id, client);
  const database = db();
  if (database) {
    const { error } = await database.rpc("oauth_register_client", {
      p_client_id: client.client_id,
      p_client_data: client,
    });
    if (error) throw error;
  }
  return client;
}

export async function saveAuthCode(rec: AuthCodeRecord): Promise<void> {
  authCodes.set(rec.code, rec);
  const database = db();
  if (database) {
    const stored = { ...rec, code: "" };
    const { error } = await database.rpc("oauth_save_authorization_code", {
      p_code_hash: codeHash(rec.code),
      p_code_data: stored,
      p_expires_at: new Date(rec.expires_at).toISOString(),
    });
    if (error) throw error;
  }
}

export async function consumeAuthCode(
  code: string,
): Promise<AuthCodeRecord | undefined> {
  const cached = authCodes.get(code);
  authCodes.delete(code);
  const database = db();
  if (!database)
    return cached && cached.expires_at >= Date.now() ? cached : undefined;
  const { data, error } = await database.rpc(
    "oauth_consume_authorization_code",
    {
      p_code_hash: codeHash(code),
    },
  );
  if (error) throw error;
  if (!data) return undefined;
  return { ...(data as Omit<AuthCodeRecord, "code">), code };
}

export function isValidRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (parsed.hash || parsed.username || parsed.password) return false;
    if (parsed.protocol === "https:") return true;
    return (
      parsed.protocol === "http:" &&
      ["127.0.0.1", "[::1]", "localhost"].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function isRedirectAllowed(
  client: RegisteredClient,
  uri: string,
): boolean {
  return isValidRedirectUri(uri) && client.redirect_uris.includes(uri);
}

export async function revokeJti(jti: string, expiresAt: number): Promise<void> {
  revokedJtis.set(jti, expiresAt);
  const database = db();
  if (database) {
    const { error } = await database.rpc("oauth_revoke_jti", {
      p_jti: jti,
      p_expires_at: new Date(expiresAt * 1000).toISOString(),
    });
    if (error) throw error;
  }
}

export async function isJtiRevoked(jti: string): Promise<boolean> {
  const cachedExpiry = revokedJtis.get(jti);
  if (cachedExpiry && cachedExpiry > Math.floor(Date.now() / 1000)) return true;
  const database = db();
  if (!database) return false;
  const { data, error } = await database.rpc("oauth_is_jti_revoked", {
    p_jti: jti,
  });
  if (error) throw error;
  return data === true;
}
