import { createSign, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext } from "@playwright/test";

// Playwright transpiles this to CommonJS, so __dirname is the portable way to
// locate the key beside this file.

/**
 * Mints a Supabase-shaped session and installs it as the auth cookie.
 *
 * Qentrax signs in by emailed magic link, which needs a mail round trip that
 * cannot run here, so the suite mints the session the identity provider would
 * have issued. The token is a real RS256 JWT verified against the harness JWKS
 * by both the app and PostgREST, so every authorization decision downstream —
 * RLS policies, is_platform_admin(), org_id_from_auth() — is exercised for real.
 */
const PRIVATE_KEY = readFileSync(path.join(__dirname, "jwt-private.pem"), "utf8");

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signAccessToken(claims: Record<string, unknown>): string {
  const header = { alg: "RS256", typ: "JWT", kid: "qentrax-e2e" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "http://127.0.0.1:54321/auth/v1",
    aud: "authenticated",
    role: "authenticated",
    iat: now,
    exp: now + 60 * 60,
    ...claims,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  return `${signingInput}.${signer.sign(PRIVATE_KEY, "base64url")}`;
}

export type TestUser = { sub: string; email: string };

/**
 * supabase-js derives its storage key from the project ref, which it takes as
 * the FIRST LABEL of the hostname — not the whole host. For
 * http://127.0.0.1:54321 that is "127", giving sb-127-auth-token. Verified
 * against the installed client rather than assumed.
 */
export function authCookieName(supabaseUrl: string): string {
  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  return `sb-${ref}-auth-token`;
}

export async function signIn(
  context: BrowserContext,
  user: TestUser,
  opts: { supabaseUrl: string; appUrl: string },
): Promise<void> {
  const accessToken = signAccessToken({ sub: user.sub, email: user.email });
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `refresh-${randomUUID()}`,
    user: {
      id: user.sub,
      aud: "authenticated",
      role: "authenticated",
      email: user.email,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };

  // @supabase/ssr stores the session as base64- prefixed JSON.
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;

  await context.addCookies([
    {
      name: authCookieName(opts.supabaseUrl),
      value,
      // Use the exact app URL instead of a host-scoped IP-domain cookie.
      // Chromium can be picky about Domain attributes on numeric hosts.
      url: opts.appUrl,
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}
