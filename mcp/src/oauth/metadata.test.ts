import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { publicBaseUrl, mcpResourceUrl } from "../lib/config.js";
import {
  protectedResourceMetadata,
  authorizationServerMetadata,
} from "./metadata.js";
import { handleOAuthRoute } from "./handlers.js";

describe("OAuth metadata derivation from MCP_PUBLIC_URL", () => {
  const original = process.env.MCP_PUBLIC_URL;

  before(() => {
    process.env.MCP_PUBLIC_URL = "https://mcp.qentrax.io";
  });

  after(() => {
    if (original === undefined) delete process.env.MCP_PUBLIC_URL;
    else process.env.MCP_PUBLIC_URL = original;
  });

  it("publicBaseUrl uses MCP_PUBLIC_URL", () => {
    assert.equal(publicBaseUrl(), "https://mcp.qentrax.io");
  });

  it("mcpResourceUrl is canonical /mcp", () => {
    assert.equal(mcpResourceUrl(), "https://mcp.qentrax.io/mcp");
  });

  it("PRM resource is https://mcp.qentrax.io/mcp", () => {
    const prm = protectedResourceMetadata(publicBaseUrl());
    assert.equal(prm.resource, "https://mcp.qentrax.io/mcp");
    assert.deepEqual(prm.authorization_servers, ["https://mcp.qentrax.io"]);
    assert.ok(!String(prm.resource).includes("supabase"));
  });

  it("AS issuer and endpoints use mcp.qentrax.io", () => {
    const as = authorizationServerMetadata(publicBaseUrl());
    assert.equal(as.issuer, "https://mcp.qentrax.io");
    assert.equal(
      as.authorization_endpoint,
      "https://mcp.qentrax.io/oauth/authorize",
    );
    assert.equal(as.token_endpoint, "https://mcp.qentrax.io/oauth/token");
    assert.equal(
      as.registration_endpoint,
      "https://mcp.qentrax.io/oauth/register",
    );
    assert.ok(as.code_challenge_methods_supported.includes("S256"));
  });

  it("serves resource-scoped discovery paths used by fresh MCP clients", async () => {
    const paths = [
      "/.well-known/oauth-protected-resource/mcp",
      "/.well-known/oauth-authorization-server/mcp",
      "/.well-known/openid-configuration/mcp",
    ];

    for (const path of paths) {
      const result = await handleOAuthRoute(
        "GET",
        path,
        new URL(path, "https://mcp.qentrax.io"),
        undefined,
        "mcp.qentrax.io",
      );
      assert.equal(
        result?.status,
        200,
        `${path} must be publicly discoverable`,
      );
      assert.doesNotThrow(() => JSON.parse(result?.body ?? ""));
    }
  });

  it("rejects Supabase origin in MCP_PUBLIC_URL", () => {
    process.env.MCP_PUBLIC_URL = "https://xxxxx.supabase.co";
    assert.throws(() => publicBaseUrl(), /must not be a Supabase origin/);
    process.env.MCP_PUBLIC_URL = "https://mcp.qentrax.io";
  });
});
