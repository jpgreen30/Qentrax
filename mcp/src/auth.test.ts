import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { authenticateMcpRequest, extractBearerToken } from "./lib/auth.js";
import { signJwt } from "./lib/jwt.js";
import { formatDemand, formatError, formatPreflight } from "./lib/format.js";

describe("MCP auth", () => {
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

  it("extracts bearer token", () => {
    const h = new Headers({ authorization: "Bearer secret-token-value" });
    assert.equal(extractBearerToken(h), "secret-token-value");
  });

  it("rejects a malformed token", async () => {
    const r = await authenticateMcpRequest(
      new Headers({ authorization: "Bearer x" }),
    );
    assert.equal(r.ok, false);
  });

  it("accepts a valid access token with issuer and audience", async () => {
    const token = signJwt(
      {
        iss: "https://mcp.qentrax.io",
        sub: "user-1",
        aud: "https://mcp.qentrax.io/mcp",
        scope: "qentrax:demand:read",
        typ: "access",
      },
      60,
    );
    const r = await authenticateMcpRequest(
      new Headers({ authorization: `Bearer ${token}` }),
    );
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.context.userId, "user-1");
  });

  it("rejects the wrong audience", async () => {
    const token = signJwt(
      {
        iss: "https://mcp.qentrax.io",
        sub: "user-1",
        aud: "https://example.com/mcp",
        typ: "access",
      },
      60,
    );
    const r = await authenticateMcpRequest(
      new Headers({ authorization: `Bearer ${token}` }),
    );
    assert.equal(r.ok, false);
  });
});

describe("formatters", () => {
  it("formats no demand", () => {
    assert.equal(
      JSON.parse(
        formatDemand({
          count: 0,
          reason_code: "NO_DEMAND",
          query: { vertical: "solar" },
        }),
      ).status,
      "no_demand",
    );
  });

  it("formats demand without internal secrets", () => {
    const parsed = JSON.parse(
      formatDemand({
        count: 1,
        candidates: [
          {
            campaign_id: "secret-uuid",
            campaign_name: "Solar CA",
            vertical: "solar",
            bid_cents: 2500,
            bid_type: "fixed",
            states: ["CA"],
            network: "qentrax_marketplace",
          },
        ],
      }),
    );
    assert.equal(parsed.opportunities[0].bid_usd, 25);
    assert.equal(parsed.opportunities[0].campaign, "Solar CA");
  });

  it("preflight states non-destructive", () => {
    assert.match(
      formatPreflight({
        eligible: true,
        status: "eligible",
        missing_fields: [],
        warnings: [],
        reason_codes: [],
        q_score: { score: 80, version: "qscore-v1" },
        potential_demand_count: 2,
      }),
      /non-destructive/i,
    );
  });

  it("formatError uses stable codes", () => {
    assert.equal(
      JSON.parse(formatError("UNAUTHORIZED", "nope")).error.code,
      "UNAUTHORIZED",
    );
  });
});
