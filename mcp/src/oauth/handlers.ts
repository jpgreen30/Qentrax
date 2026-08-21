/**
 * OAuth 2.1 AS for Qentrax MCP — authorization_code + PKCE + refresh.
 * Issuer / resource always derive from MCP_PUBLIC_URL via publicBaseUrl().
 * Supabase is used only for credential verification + membership reads + password reset emails.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { mcpResourceUrl, publicBaseUrl, SCOPES } from "../lib/config.js";
import { signJwt, verifyJwt, pkceS256 } from "../lib/jwt.js";
import {
  registerClient,
  getClient,
  saveAuthCode,
  consumeAuthCode,
  isRedirectAllowed,
  isValidRedirectUri,
  isJtiRevoked,
  revokeJti,
} from "./store.js";
import {
  protectedResourceMetadata,
  authorizationServerMetadata,
  openidConfiguration,
} from "./metadata.js";
import { requestPasswordReset } from "./password-reset.js";
import {
  forgotPasswordHtml,
  resetPasswordHtml,
  type OAuthReturnParams,
} from "./password-pages.js";

function sb() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    "";
  if (!url || !key) throw new Error("Supabase URL/key required");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function form(body: string) {
  const o: Record<string, string> = {};
  for (const p of body.split("&")) {
    const [k, v] = p.split("=");
    if (k)
      o[decodeURIComponent(k)] = decodeURIComponent(
        (v ?? "").replace(/\+/g, " "),
      );
  }
  return o;
}
function esc(s: string) {
  return s
    .replace(/&/g, "&" + "amp;")
    .replace(/</g, "&" + "lt;")
    .replace(/>/g, "&" + "gt;")
    .replace(/"/g, "&" + "quot;");
}
function oauthReturnFromRecord(r: Record<string, string>): OAuthReturnParams {
  return {
    client_id: r.client_id || undefined,
    redirect_uri: r.redirect_uri || undefined,
    state: r.state || undefined,
    scope: r.scope || undefined,
    code_challenge: r.code_challenge || undefined,
    code_challenge_method: r.code_challenge_method || undefined,
    resource: r.resource || undefined,
    nonce: r.nonce || undefined,
  };
}
function oauthReturnFromUrl(url: URL): OAuthReturnParams {
  return {
    client_id: url.searchParams.get("client_id") ?? undefined,
    redirect_uri: url.searchParams.get("redirect_uri") ?? undefined,
    state: url.searchParams.get("state") ?? undefined,
    scope: url.searchParams.get("scope") ?? undefined,
    code_challenge: url.searchParams.get("code_challenge") ?? undefined,
    code_challenge_method:
      url.searchParams.get("code_challenge_method") ?? undefined,
    resource: url.searchParams.get("resource") ?? undefined,
    nonce: url.searchParams.get("nonce") ?? undefined,
  };
}
function loginHtml(p: Record<string, string>, err?: string) {
  const q = new URLSearchParams();
  for (const k of [
    "client_id",
    "redirect_uri",
    "state",
    "scope",
    "code_challenge",
    "code_challenge_method",
    "resource",
    "nonce",
  ])
    if (p[k]) q.set(k, p[k]);
  const forgot = `/oauth/forgot-password${q.toString() ? `?${q}` : ""}`;
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Qentrax Sign in</title><style>body{font-family:system-ui;background:#0b1220;color:#e5e7eb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}.card{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:28px;max-width:400px;width:100%}input,button{width:100%;box-sizing:border-box;margin:8px 0;padding:10px;border-radius:8px;border:1px solid #374151;background:#0b1220;color:#fff}button{background:#2563eb;border:0;font-weight:600;cursor:pointer}.err{color:#f87171}.row{display:flex;justify-content:space-between}.row a{font-size:12px;color:#93c5fd}</style></head><body><form class="card" method="POST" action="/oauth/authorize"><h1>Sign in to Qentrax</h1>${err ? `<p class="err">${esc(err)}</p>` : ""}<input type="hidden" name="client_id" value="${esc(p.client_id || "")}"/><input type="hidden" name="redirect_uri" value="${esc(p.redirect_uri || "")}"/><input type="hidden" name="state" value="${esc(p.state || "")}"/><input type="hidden" name="scope" value="${esc(p.scope || "")}"/><input type="hidden" name="code_challenge" value="${esc(p.code_challenge || "")}"/><input type="hidden" name="code_challenge_method" value="${esc(p.code_challenge_method || "S256")}"/><input type="hidden" name="resource" value="${esc(p.resource || "")}"/><input type="hidden" name="nonce" value="${esc(p.nonce || "")}"/><input type="hidden" name="response_type" value="code"/><label>Email</label><input type="email" name="email" required autocomplete="username"/><div class="row"><label>Password</label><a href="${esc(forgot)}">Forgot password?</a></div><input type="password" name="password" required autocomplete="current-password"/><button type="submit">Authorize</button><p style="font-size:12px;color:#6b7280">Uses your Qentrax account. Read/preflight tools only.</p></form></body></html>`;
}

export async function handleOAuthRoute(
  method: string,
  pathname: string,
  url: URL,
  rawBody: string | undefined,
  host: string | null,
): Promise<{
  status: number;
  headers?: Record<string, string>;
  body?: string;
  redirect?: string;
} | null> {
  const base = publicBaseUrl(host);
  const j = (status: number, body: unknown) => ({
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  });
  const html = (status: number, body: string) => ({
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
    body,
  });
  if (
    method === "GET" &&
    (pathname === "/.well-known/oauth-protected-resource" ||
      pathname === "/.well-known/oauth-protected-resource/mcp")
  )
    return j(200, protectedResourceMetadata(base));
  if (
    method === "GET" &&
    (pathname === "/.well-known/oauth-authorization-server" ||
      pathname === "/.well-known/oauth-authorization-server/mcp")
  )
    return j(200, authorizationServerMetadata(base));
  if (
    method === "GET" &&
    (pathname === "/.well-known/openid-configuration" ||
      pathname === "/.well-known/openid-configuration/mcp")
  )
    return j(200, openidConfiguration(base));
  if (pathname === "/oauth/forgot-password") {
    if (method === "GET")
      return html(200, forgotPasswordHtml(oauthReturnFromUrl(url)));
    if (method === "POST") {
      const f = form(rawBody ?? "");
      const ret = oauthReturnFromRecord(f);
      if (!f.email)
        return html(
          200,
          forgotPasswordHtml(ret, { err: "Email is required." }),
        );
      const result = await requestPasswordReset(f.email, base);
      return html(
        200,
        forgotPasswordHtml(
          ret,
          result.ok
            ? {
                ok: "If an account exists for that email, we sent a password reset link. Check your inbox.",
              }
            : { err: result.message },
        ),
      );
    }
  }
  if (method === "GET" && pathname === "/oauth/reset-password")
    return html(200, resetPasswordHtml(oauthReturnFromUrl(url)));
  if (method === "POST" && pathname === "/oauth/register") {
    let body: Record<string, unknown> = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return j(400, { error: "invalid_client_metadata" });
    }
    const redirect_uris = Array.isArray(body.redirect_uris)
      ? body.redirect_uris.filter((v): v is string => typeof v === "string")
      : [];
    if (
      !redirect_uris.length ||
      redirect_uris.some((uri) => !isValidRedirectUri(uri))
    )
      return j(400, { error: "invalid_redirect_uri" });
    const authMethod =
      typeof body.token_endpoint_auth_method === "string"
        ? body.token_endpoint_auth_method
        : "none";
    if (authMethod !== "none")
      return j(400, {
        error: "invalid_client_metadata",
        error_description:
          "public PKCE clients must use token_endpoint_auth_method none",
      });
    const c = await registerClient({
      client_name:
        typeof body.client_name === "string" ? body.client_name : undefined,
      redirect_uris,
      token_endpoint_auth_method: authMethod,
    });
    return {
      status: 201,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
      body: JSON.stringify({
        client_id: c.client_id,
        client_id_issued_at: Math.floor(c.created_at / 1000),
        client_name: c.client_name,
        redirect_uris: c.redirect_uris,
        grant_types: c.grant_types,
        response_types: c.response_types,
        token_endpoint_auth_method: c.token_endpoint_auth_method,
      }),
    };
  }
  if (pathname === "/oauth/authorize") {
    if (method === "GET") {
      const p = {
        client_id: url.searchParams.get("client_id") ?? "",
        redirect_uri: url.searchParams.get("redirect_uri") ?? "",
        state: url.searchParams.get("state") ?? "",
        scope: url.searchParams.get("scope") ?? SCOPES.join(" "),
        code_challenge: url.searchParams.get("code_challenge") ?? "",
        code_challenge_method:
          url.searchParams.get("code_challenge_method") ?? "S256",
        resource: url.searchParams.get("resource") ?? mcpResourceUrl(base),
        nonce: url.searchParams.get("nonce") ?? "",
      };
      if (!p.client_id || !p.redirect_uri || !p.code_challenge)
        return j(400, {
          error: "invalid_request",
          error_description:
            "missing client_id, redirect_uri, or code_challenge",
        });
      const client = await getClient(p.client_id);
      if (!client) return j(400, { error: "invalid_client" });
      if (!isRedirectAllowed(client, p.redirect_uri))
        return j(400, { error: "invalid_redirect_uri" });
      if (p.code_challenge_method !== "S256")
        return j(400, {
          error: "invalid_request",
          error_description: "code_challenge_method must be S256",
        });
      if (p.resource !== mcpResourceUrl(base))
        return j(400, { error: "invalid_target" });
      const requestedScopes = p.scope.split(/\s+/).filter(Boolean);
      if (
        requestedScopes.some(
          (scope) => !SCOPES.includes(scope as (typeof SCOPES)[number]),
        )
      )
        return j(400, { error: "invalid_scope" });
      return html(200, loginHtml(p));
    }
    if (method === "POST") {
      const f = form(rawBody ?? "");
      const fail = (msg: string) => html(200, loginHtml(f, msg));
      const client = await getClient(f.client_id ?? "");
      if (!client) return j(400, { error: "invalid_client" });
      if (!isRedirectAllowed(client, f.redirect_uri ?? ""))
        return j(400, { error: "invalid_redirect_uri" });
      if ((f.code_challenge_method || "S256") !== "S256")
        return j(400, { error: "invalid_request" });
      if ((f.resource || mcpResourceUrl(base)) !== mcpResourceUrl(base))
        return j(400, { error: "invalid_target" });
      const requestedScopes = (f.scope || SCOPES.join(" "))
        .split(/\s+/)
        .filter(Boolean);
      if (
        requestedScopes.some(
          (scope) => !SCOPES.includes(scope as (typeof SCOPES)[number]),
        )
      )
        return j(400, { error: "invalid_scope" });
      if (!f.email || !f.password) return fail("Email and password required.");
      try {
        const { data, error } = await sb().auth.signInWithPassword({
          email: f.email,
          password: f.password,
        });
        if (error || !data.user)
          return fail(error?.message ?? "Invalid credentials");
        const code = randomBytes(24).toString("base64url");
        await saveAuthCode({
          code,
          client_id: f.client_id,
          redirect_uri: f.redirect_uri,
          code_challenge: f.code_challenge,
          code_challenge_method: "S256",
          scope: requestedScopes.join(" "),
          resource: mcpResourceUrl(base),
          nonce: f.nonce || undefined,
          user_id: data.user.id,
          email: data.user.email ?? f.email,
          expires_at: Date.now() + 300000,
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
      try {
        f = JSON.parse(rawBody) as Record<string, string>;
      } catch {}
    }
    const audience = mcpResourceUrl(base),
      atTtl = Number(process.env.MCP_ACCESS_TOKEN_TTL ?? 3600),
      rtTtl = Number(process.env.MCP_REFRESH_TOKEN_TTL ?? 2592000);
    if (f.grant_type === "authorization_code") {
      const rec = await consumeAuthCode(f.code ?? "");
      if (
        !rec ||
        rec.client_id !== f.client_id ||
        rec.redirect_uri !== f.redirect_uri
      )
        return j(400, { error: "invalid_grant" });
      if (pkceS256(f.code_verifier ?? "") !== rec.code_challenge)
        return j(400, {
          error: "invalid_grant",
          error_description: "pkce failed",
        });
      const at = signJwt(
        {
          iss: base,
          sub: rec.user_id,
          aud: audience,
          scope: rec.scope,
          client_id: rec.client_id,
          email: rec.email,
          typ: "access",
        },
        atTtl,
      );
      const rt = signJwt(
        {
          iss: base,
          sub: rec.user_id,
          aud: audience,
          scope: rec.scope,
          client_id: rec.client_id,
          email: rec.email,
          typ: "refresh",
        },
        rtTtl,
      );
      const idToken = rec.scope.split(/\s+/).includes("openid")
        ? signJwt(
            {
              iss: base,
              sub: rec.user_id,
              aud: rec.client_id,
              email: rec.email,
              email_verified: true,
              nonce: rec.nonce,
              typ: "id",
            },
            atTtl,
          )
        : undefined;
      return j(200, {
        access_token: at,
        token_type: "Bearer",
        expires_in: atTtl,
        refresh_token: rt,
        id_token: idToken,
        scope: rec.scope,
      });
    }
    if (f.grant_type === "refresh_token") {
      const v = verifyJwt(f.refresh_token ?? "", { issuer: base, audience });
      if (
        !v.ok ||
        v.payload.typ !== "refresh" ||
        !v.payload.jti ||
        (await isJtiRevoked(v.payload.jti))
      )
        return j(400, { error: "invalid_grant" });
      const p = v.payload;
      await revokeJti(
        p.jti!,
        typeof p.exp === "number"
          ? p.exp
          : Math.floor(Date.now() / 1000) + rtTtl,
      );
      const at = signJwt(
        {
          iss: base,
          sub: p.sub,
          aud: audience,
          scope: p.scope,
          client_id: p.client_id,
          email: p.email,
          typ: "access",
        },
        atTtl,
      );
      const rt = signJwt(
        {
          iss: base,
          sub: p.sub,
          aud: audience,
          scope: p.scope,
          client_id: p.client_id,
          email: p.email,
          typ: "refresh",
        },
        rtTtl,
      );
      return j(200, {
        access_token: at,
        token_type: "Bearer",
        expires_in: atTtl,
        refresh_token: rt,
        scope: p.scope,
      });
    }
    return j(400, { error: "unsupported_grant_type" });
  }
  if (method === "POST" && pathname === "/oauth/revoke") {
    const f = form(rawBody ?? "");
    const v = verifyJwt(f.token ?? "", { issuer: base });
    if (v.ok && v.payload.jti && typeof v.payload.exp === "number")
      await revokeJti(v.payload.jti, v.payload.exp);
    return { status: 200, headers: { "cache-control": "no-store" }, body: "" };
  }
  return null;
}
export type AccessPrincipal = {
  userId: string;
  email?: string;
  scope: string;
  clientId?: string;
};
export async function verifyAccessToken(
  h: string | null,
  base: string,
): Promise<
  { ok: true; principal: AccessPrincipal } | { ok: false; error: string }
> {
  if (!h?.toLowerCase().startsWith("bearer "))
    return { ok: false, error: "missing_token" };
  const token = h.slice(7).trim();
  if (!token) return { ok: false, error: "missing_token" };
  const v = verifyJwt(token, { issuer: base, audience: mcpResourceUrl(base) });
  if (!v.ok) return { ok: false, error: v.error };
  if (v.payload.typ !== "access")
    return { ok: false, error: "not_access_token" };
  if (!v.payload.sub) return { ok: false, error: "missing_sub" };
  if (v.payload.jti && (await isJtiRevoked(v.payload.jti)))
    return { ok: false, error: "token_revoked" };
  return {
    ok: true,
    principal: {
      userId: String(v.payload.sub),
      email: typeof v.payload.email === "string" ? v.payload.email : undefined,
      scope: typeof v.payload.scope === "string" ? v.payload.scope : "",
      clientId:
        typeof v.payload.client_id === "string"
          ? v.payload.client_id
          : undefined,
    },
  };
}
