import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleOAuthRoute, verifyAccessToken } from "./handlers.js";
import { pkceS256, verifyJwt } from "../lib/jwt.js";
import { registerClient, saveAuthCode } from "./store.js";

describe("OAuth production hardening", () => {
  const originalSecret = process.env.MCP_JWT_SECRET;
  const originalPublicUrl = process.env.MCP_PUBLIC_URL;

  before(() => {
    process.env.MCP_JWT_SECRET = "unit-test-secret-at-least-16-characters";
    process.env.MCP_PUBLIC_URL = "https://mcp.qentrax.io";
  });

  after(() => {
    if (originalSecret === undefined) delete process.env.MCP_JWT_SECRET;
    else process.env.MCP_JWT_SECRET = originalSecret;
    if (originalPublicUrl === undefined) delete process.env.MCP_PUBLIC_URL;
    else process.env.MCP_PUBLIC_URL = originalPublicUrl;
  });

  it("rejects non-HTTPS dynamic redirect URIs", async () => {
    const result = await handleOAuthRoute(
      "POST",
      "/oauth/register",
      new URL("https://mcp.qentrax.io/oauth/register"),
      JSON.stringify({ redirect_uris: ["javascript:alert(1)"] }),
      "mcp.qentrax.io",
    );
    assert.equal(result?.status, 400);
    assert.equal(
      JSON.parse(result?.body ?? "{}").error,
      "invalid_redirect_uri",
    );
  });

  it("requires the exact registered redirect URI", async () => {
    const client = await registerClient({
      redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
    });
    const url = new URL("https://mcp.qentrax.io/oauth/authorize");
    url.searchParams.set("client_id", client.client_id);
    url.searchParams.set("redirect_uri", "https://example.com/callback");
    url.searchParams.set("code_challenge", "challenge");
    url.searchParams.set("code_challenge_method", "S256");
    const result = await handleOAuthRoute(
      "GET",
      url.pathname,
      url,
      undefined,
      "mcp.qentrax.io",
    );
    assert.equal(result?.status, 400);
    assert.equal(
      JSON.parse(result?.body ?? "{}").error,
      "invalid_redirect_uri",
    );
  });

  it("issues an ID token and revokes access tokens", async () => {
    const verifier = "verifier-that-is-long-enough-for-pkce-S256-123456";
    const client = await registerClient({
      redirect_uris: ["https://example.com/callback"],
    });
    await saveAuthCode({
      code: "one-time-code",
      client_id: client.client_id,
      redirect_uri: "https://example.com/callback",
      code_challenge: pkceS256(verifier),
      code_challenge_method: "S256",
      scope: "openid offline_access qentrax:demand:read",
      resource: "https://mcp.qentrax.io/mcp",
      nonce: "test-nonce",
      user_id: "user-1",
      email: "reviewer@example.com",
      expires_at: Date.now() + 60_000,
    });
    const tokenResult = await handleOAuthRoute(
      "POST",
      "/oauth/token",
      new URL("https://mcp.qentrax.io/oauth/token"),
      new URLSearchParams({
        grant_type: "authorization_code",
        code: "one-time-code",
        client_id: client.client_id,
        redirect_uri: "https://example.com/callback",
        code_verifier: verifier,
      }).toString(),
      "mcp.qentrax.io",
    );
    assert.equal(tokenResult?.status, 200);
    const tokens = JSON.parse(tokenResult?.body ?? "{}");
    const idToken = verifyJwt(tokens.id_token, {
      issuer: "https://mcp.qentrax.io",
      audience: client.client_id,
    });
    assert.equal(idToken.ok, true);
    if (idToken.ok) assert.equal(idToken.payload.nonce, "test-nonce");
    assert.equal(
      (
        await verifyAccessToken(
          `Bearer ${tokens.access_token}`,
          "https://mcp.qentrax.io",
        )
      ).ok,
      true,
    );

    const revokeResult = await handleOAuthRoute(
      "POST",
      "/oauth/revoke",
      new URL("https://mcp.qentrax.io/oauth/revoke"),
      new URLSearchParams({ token: tokens.access_token }).toString(),
      "mcp.qentrax.io",
    );
    assert.equal(revokeResult?.status, 200);
    assert.equal(
      (
        await verifyAccessToken(
          `Bearer ${tokens.access_token}`,
          "https://mcp.qentrax.io",
        )
      ).ok,
      false,
    );
  });
});
