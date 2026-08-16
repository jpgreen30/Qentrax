/**
 * OAuth 2.1 AS for Qentrax MCP — authorization_code + PKCE + refresh.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { mcpResourceUrl, SCOPES } from "../lib/config.js";
import { signJwt, verifyJwt, pkceS256 } from "../lib/jwt.js";
import {
  registerClient, getClient, saveAuthCode, consumeAuthCode,
  isRedirectAllowed, ensureClient,
} from "./store.js";
import {
  protectedResourceMetadata, authorizationServerMetadata,
  openidConfiguration,
} from "./metadata.js";

function baseUrl(host: string | null) {
  return (process.env.MCP_PUBLIC_URL ?? (host ? `https://${host}` : "http://127.0.0.1:3100")).replace(/\/$/, "");
}
function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
  if (!url || !key) throw new Error("Supabase URL/key required");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function form(body: string) {
  const o: Record<string, string> = {};
  for (const p of body.split("&")) {
    const [k, v] = p.split("=");
    if (k) o[decodeURIComponent(k)] = decodeURIComponent((v ?? "").replace(/\+/g, " "));
  }
  return o;
}
function esc(s: string) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function loginHtml(p: Record<string, string>, err?: string) {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Qentrax Sign in</title>
<style>body{font-family:system-ui;background:#0b1220;color:#e5e7eb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:28px;max-width:400px;width:100%}
input,button{width:100%;box-sizing:border-box;margin:8px 0;padding:10px;border-radius:8px;border:1px solid #374151;background:#0b1220;color:#fff}
button{background:#2563eb;border:0;font-weight:600;cursor:pointer}.err{color:#f87171}</style></head><body>
<form class="card" method="POST" action="/oauth/authorize">
<h1>Sign in to Qentrax</h1>${err?`<p class="err">${esc(err)}</p>`:""}
<input type="hidden" name="client_id" value="${esc(p.client_id||"")}"/>
<input type="hidden" name="redirect_uri" value="${esc(p.redirect_uri||"")}"/>
<input type="hidden" name="state" value="${esc(p.state||"")}"/>
<input type="hidden" name="scope" value="${esc(p.scope||"")}"/>
<input type="hidden" name="code_challenge" value="${esc(p.code_challenge||"")}"/>
<input type="hidden" name="code_challenge_method" value="${esc(p.code_challenge_method||"S256")}"/>
<input type="hidden" name="resource" value="${esc(p.resource||"")}"/>
<input type="hidden" name="response_type" value="code"/>
<label>Email</label><input type="email" name="email" required/>
<label>Password</label><input type="password" name="password" required/>
<button type="submit">Authorize</button>
<p style="font-size:12px;color:#6b7280">Uses your Qentrax account. Read/preflight tools only.</p>
</form></body></html>`;
}

export async function handleOAuthRoute(
  method: string, pathname: string, url: URL, rawBody: string | undefined, host: string | null,
): Promise<{ status: number; headers?: Record<string, string>; body?: string; redirect?: string } | null> {
  const base = baseUrl(host);
  const j = (status: number, body: unknown) => ({
    status, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body),
  });

  if (method === "GET" && (pathname === "/.well-known/oauth-protected-resource" || pathname === "/.well-known/oauth-protected-resource/mcp"))
    return j(200, protectedResourceMetadata(base));
  if (method === "GET" && (pathname === "/.well-known/oauth-authorization-server" || pathname === "/.well-known/oauth-authorization-server/mcp"))
    return j(200, authorizationServerMetadata(base));
  if (method === "GET" && (pathname === "/.well-known/openid-configuration" || pathname === "/.well-known/openid-configuration/mcp"))
    return j(200, openidConfiguration(base));

  if (method === "POST" && pathname === "/oauth/register") {
    let body: Record<string, unknown> = {};
    try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { return j(400, { error: "invalid_client_metadata" }); }
    const redirect_uris = Array.isArray(body.redirect_uris) ? body.redirect_uris as string[] : [];
    if (!redirect_uris.length) return j(400, { error: "invalid_redirect_uri" });
    const c = registerClient({
      client_name: typeof body.client_name === "string" ? body.client_name : undefined,
      redirect_uris,
      token_endpoint_auth_method: typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none",
    });
    return { status: 201, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify({
      client_id: c.client_id, client_id_issued_at: Math.floor(c.created_at/1000),
      client_name: c.client_name, redirect_uris: c.redirect_uris, grant_types: c.grant_types,
      response_types: c.response_types, token_endpoint_auth_method: c.token_endpoint_auth_method,
    })};
  }

  if (pathname === "/oauth/authorize") {
    if (method === "GET") {
      const p = {
        client_id: url.searchParams.get("client_id") ?? "",
        redirect_uri: url.searchParams.get("redirect_uri") ?? "",
        state: url.searchParams.get("state") ?? "",
        scope: url.searchParams.get("scope") ?? SCOPES.join(" "),
        code_challenge: url.searchParams.get("code_challenge") ?? "",
        code_challenge_method: url.searchParams.get("code_challenge_method") ?? "S256",
        resource: url.searchParams.get("resource") ?? mcpResourceUrl(base),
      };
      if (!p.client_id || !p.redirect_uri || !p.code_challenge)
        return { status: 400, body: "missing client_id, redirect_uri, or code_challenge" };
      if (p.code_challenge_method !== "S256") return { status: 400, body: "code_challenge_method must be S256" };
      if (!getClient(p.client_id)) {
        ensureClient({ client_id: p.client_id, redirect_uris: [p.redirect_uri], grant_types: ["authorization_code","refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", created_at: Date.now() });
      }
      return { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }, body: loginHtml(p) };
    }
    if (method === "POST") {
      const f = form(rawBody ?? "");
      const fail = (msg: string) => ({ status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: loginHtml(f, msg) });
      if (!f.email || !f.password) return fail("Email and password required.");
      try {
        const { data, error } = await sb().auth.signInWithPassword({ email: f.email, password: f.password });
        if (error || !data.user) return fail(error?.message ?? "Invalid credentials");
        const code = randomBytes(24).toString("base64url");
        saveAuthCode({
          code, client_id: f.client_id, redirect_uri: f.redirect_uri,
          code_challenge: f.code_challenge, code_challenge_method: f.code_challenge_method || "S256",
          scope: f.scope || SCOPES.join(" "), resource: f.resource || mcpResourceUrl(base),
          user_id: data.user.id, email: data.user.email ?? f.email, expires_at: Date.now() + 300000,
        });
        const redir = new URL(f.redirect_uri);
        redir.searchParams.set("code", code);
        if (f.state) redir.searchParams.set("state", f.state);
        redir.searchParams.set("iss", base);
        return { status: 302, redirect: redir.toString() };
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Auth failed");
      }
    }
  }

  if (method === "POST" && pathname === "/oauth/token") {
    let f = form(rawBody ?? "");
    if (!f.grant_type && rawBody?.trim().startsWith("{")) {
      try { f = JSON.parse(rawBody) as Record<string, string>; } catch { /* */ }
    }
    const aud = f.resource || mcpResourceUrl(base);
    const atTtl = Number(process.env.MCP_ACCESS_TOKEN_TTL ?? 3600);
    const rtTtl = Number(process.env.MCP_REFRESH_TOKEN_TTL ?? 2592000);

    if (f.grant_type === "authorization_code") {
      const rec = consumeAuthCode(f.code ?? "");
      if (!rec || rec.client_id !== f.client_id) return j(400, { error: "invalid_grant" });
      if (f.redirect_uri && rec.redirect_uri !== f.redirect_uri) return j(400, { error: "invalid_grant" });
      if (pkceS256(f.code_verifier ?? "") !== rec.code_challenge) return j(400, { error: "invalid_grant", error_description: "pkce failed" });
      const tokenAud = rec.resource || aud;
      const at = signJwt({ iss: base, sub: rec.user_id, aud: tokenAud, scope: rec.scope, client_id: rec.client_id, email: rec.email, typ: "access" }, atTtl);
      const rt = signJwt({ iss: base, sub: rec.user_id, aud: tokenAud, scope: rec.scope, client_id: rec.client_id, email: rec.email, typ: "refresh" }, rtTtl);
      return j(200, { access_token: at, token_type: "Bearer", expires_in: atTtl, refresh_token: rt, scope: rec.scope });
    }
    if (f.grant_type === "refresh_token") {
      const v = verifyJwt(f.refresh_token ?? "", { issuer: base });
      if (!v.ok || v.payload.typ !== "refresh") return j(400, { error: "invalid_grant" });
      const p = v.payload;
      const tokenAud = (typeof p.aud === "string" ? p.aud : Array.isArray(p.aud) ? p.aud[0] : aud) as string;
      const at = signJwt({ iss: base, sub: p.sub, aud: tokenAud, scope: p.scope, client_id: p.client_id, email: p.email, typ: "access" }, atTtl);
      const rt = signJwt({ iss: base, sub: p.sub, aud: tokenAud, scope: p.scope, client_id: p.client_id, email: p.email, typ: "refresh" }, rtTtl);
      return j(200, { access_token: at, token_type: "Bearer", expires_in: atTtl, refresh_token: rt, scope: p.scope });
    }
    return j(400, { error: "unsupported_grant_type" });
  }
  return null;
}

export type AccessPrincipal = { userId: string; email?: string; scope: string; clientId?: string };

export function verifyAccessToken(authorizationHeader: string | null, base: string):
  { ok: true; principal: AccessPrincipal } | { ok: false; error: string } {
  if (!authorizationHeader?.toLowerCase().startsWith("bearer ")) return { ok: false, error: "missing_token" };
  const token = authorizationHeader.slice(7).trim();
  if (!token) return { ok: false, error: "missing_token" };
  const verified = verifyJwt(token);
  if (!verified.ok) return { ok: false, error: verified.error };
  if (verified.payload.typ && verified.payload.typ !== "access") return { ok: false, error: "not_access_token" };
  if (!verified.payload.sub) return { ok: false, error: "missing_sub" };
  return {
    ok: true,
    principal: {
      userId: String(verified.payload.sub),
      email: typeof verified.payload.email === "string" ? verified.payload.email : undefined,
      scope: typeof verified.payload.scope === "string" ? verified.payload.scope : "",
      clientId: typeof verified.payload.client_id === "string" ? verified.payload.client_id : undefined,
    },
  };
}
