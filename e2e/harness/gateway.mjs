/**
 * Local stand-in for the Supabase edge, for browser end-to-end runs.
 *
 * Routes /rest/v1/* to a real PostgREST process, so row-level security,
 * embedded relations and RPC behave exactly as they do in production. Only the
 * identity provider is simulated: Qentrax signs in by emailed magic link, which
 * needs a mail round trip, so the suite mints a session directly and this
 * server serves the JWKS that verifies it. Application logic is never stubbed.
 */
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const jwks = JSON.parse(fs.readFileSync(path.join(dir, "jwks.json"), "utf8"));

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const PGRST = process.env.PGRST_URL ?? "http://127.0.0.1:3001";
const users = JSON.parse(process.env.E2E_USERS ?? "{}"); // sub -> user object

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "*",
  });
  res.end(payload);
}

function decodePayload(auth) {
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    return JSON.parse(
      Buffer.from(auth.slice(7).split(".")[1], "base64url").toString("utf8"),
    );
  } catch {
    return null;
  }
}

function userFromClaims(payload) {
  if (!payload?.sub) return null;
  const now = new Date().toISOString();
  return {
    id: payload.sub,
    aud: payload.aud ?? "authenticated",
    role: payload.role ?? "authenticated",
    email: payload.email ?? null,
    phone: null,
    app_metadata: payload.app_metadata ?? {},
    user_metadata: payload.user_metadata ?? {},
    identities: [],
    factors: [],
    created_at: payload.created_at ?? now,
    updated_at: payload.updated_at ?? now,
    last_sign_in_at: payload.last_sign_in_at ?? now,
    is_anonymous: false,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === "OPTIONS") return json(res, 204, {});

  // ---- auth ----------------------------------------------------------------
  if (url.pathname === "/auth/v1/.well-known/jwks.json" || url.pathname === "/auth/v1/jwks") {
    return json(res, 200, jwks);
  }

  if (url.pathname === "/auth/v1/user") {
    const payload = decodePayload(req.headers.authorization);
    const user = payload?.sub ? users[payload.sub] ?? userFromClaims(payload) : null;
    if (!user) return json(res, 401, { message: "invalid claim: missing sub" });
    return json(res, 200, user);
  }

  if (url.pathname === "/auth/v1/token") {
    // Refresh is a no-op here: the suite mints long-lived tokens.
    const payload = decodePayload(req.headers.authorization);
    const sub = payload?.sub ?? null;
    return json(res, 400, { error: "not_supported", sub });
  }

  if (url.pathname === "/auth/v1/logout") return json(res, 204, {});

  // ---- rest ----------------------------------------------------------------
  if (url.pathname.startsWith("/rest/v1")) {
    const target = PGRST + url.pathname.replace("/rest/v1", "") + url.search;
    const headers = { ...req.headers };
    delete headers.host;
    delete headers["content-length"];
    // PostgREST reads the role from the JWT; anon requests still need a role.
    if (!headers.authorization) headers.authorization = "";

    const body =
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : await new Promise((resolve) => {
            const chunks = [];
            req.on("data", (c) => chunks.push(c));
            req.on("end", () => resolve(Buffer.concat(chunks)));
          });

    try {
      const upstream = await fetch(target, { method: req.method, headers, body });
      const text = await upstream.text();
      const out = { "Access-Control-Allow-Origin": "*" };
      for (const [k, v] of upstream.headers.entries()) {
        if (!["content-encoding", "transfer-encoding", "connection"].includes(k)) out[k] = v;
      }
      res.writeHead(upstream.status, out);
      return res.end(text);
    } catch (err) {
      return json(res, 502, { message: `gateway: ${err.message}` });
    }
  }

  return json(res, 404, { message: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`gateway listening on http://127.0.0.1:${PORT} -> ${PGRST}`);
});
