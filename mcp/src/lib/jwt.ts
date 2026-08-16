import { createHmac, createHash, timingSafeEqual, randomBytes } from "node:crypto";

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b.toString("base64url");
}

function parseB64url(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

export type JwtPayload = Record<string, unknown> & {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  jti?: string;
  scope?: string;
  client_id?: string;
  typ?: string;
};

function signingKey(): Buffer {
  const secret = process.env.MCP_JWT_SECRET ?? process.env.QENTRAX_MCP_TOKEN ?? "";
  if (!secret || secret.length < 16) {
    throw new Error("MCP_JWT_SECRET (or QENTRAX_MCP_TOKEN fallback) must be set (≥16 chars)");
  }
  return Buffer.from(secret, "utf8");
}

export function signJwt(payload: JwtPayload, expiresInSec: number): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body: JwtPayload = {
    ...payload,
    iat: payload.iat ?? now,
    exp: payload.exp ?? now + expiresInSec,
    jti: payload.jti ?? randomBytes(12).toString("hex"),
  };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  const sig = createHmac("sha256", signingKey()).update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64url(sig)}`;
}

export function verifyJwt(
  token: string,
  opts?: { audience?: string; issuer?: string },
): { ok: true; payload: JwtPayload } | { ok: false; error: string } {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, error: "malformed_token" };
    const [h, p, s] = parts;
    const expected = createHmac("sha256", signingKey()).update(`${h}.${p}`).digest();
    const actual = parseB64url(s);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return { ok: false, error: "invalid_signature" };
    }
    const payload = JSON.parse(parseB64url(p).toString("utf8")) as JwtPayload;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === "number" && payload.exp < now) {
      return { ok: false, error: "token_expired" };
    }
    if (opts?.issuer && payload.iss !== opts.issuer) {
      return { ok: false, error: "invalid_issuer" };
    }
    if (opts?.audience) {
      const aud = payload.aud;
      const okAud =
        aud === opts.audience ||
        (Array.isArray(aud) && aud.includes(opts.audience));
      if (!okAud) return { ok: false, error: "invalid_audience" };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "token_parse_error" };
  }
}

export function pkceS256(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}
