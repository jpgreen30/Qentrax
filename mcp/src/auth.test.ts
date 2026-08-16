import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { authenticateMcpRequest, extractBearerToken } from "./lib/auth.ts";
import { formatDemand, formatError, formatPreflight } from "./lib/format.ts";

describe("MCP auth", () => {
  it("extracts bearer token", () => {
    const h = new Headers({ authorization: "Bearer secret-token-value" });
    assert.equal(extractBearerToken(h), "secret-token-value");
  });

  it("rejects missing config", () => {
    delete process.env.QENTRAX_MCP_TOKEN;
    const r = authenticateMcpRequest(new Headers({ authorization: "Bearer x" }));
    assert.equal(r.ok, false);
  });

  it("accepts valid token with org binding", () => {
    process.env.QENTRAX_MCP_TOKEN = "test-token-at-least-16chars";
    process.env.QENTRAX_MCP_ORG_ID = "00000000-0000-0000-0000-000000000001";
    process.env.QENTRAX_MCP_ROLE = "publisher";
    const r = authenticateMcpRequest(
      new Headers({ authorization: "Bearer test-token-at-least-16chars" }),
    );
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.context.organizationId, "00000000-0000-0000-0000-000000000001");
      assert.equal(r.context.role, "publisher");
    }
  });

  it("rejects wrong token", () => {
    process.env.QENTRAX_MCP_TOKEN = "test-token-at-least-16chars";
    process.env.QENTRAX_MCP_ORG_ID = "00000000-0000-0000-0000-000000000001";
    const r = authenticateMcpRequest(new Headers({ authorization: "Bearer wrong-token-xxxxxx" }));
    assert.equal(r.ok, false);
  });
});

describe("formatters", () => {
  it("formats no demand", () => {
    const text = formatDemand({ count: 0, reason_code: "NO_DEMAND", query: { vertical: "solar" } });
    const j = JSON.parse(text);
    assert.equal(j.status, "no_demand");
  });

  it("formats demand without internal secrets", () => {
    const text = formatDemand({
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
    });
    const j = JSON.parse(text);
    assert.equal(j.status, "demand_found");
    assert.equal(j.opportunities[0].bid_usd, 25);
    assert.equal(j.opportunities[0].campaign, "Solar CA");
  });

  it("preflight states non-destructive", () => {
    const text = formatPreflight({
      eligible: true,
      status: "eligible",
      missing_fields: [],
      warnings: [],
      reason_codes: [],
      q_score: { score: 80, version: "qscore-v1" },
      potential_demand_count: 2,
    });
    assert.match(text, /non-destructive/i);
  });

  it("formatError uses stable codes", () => {
    const j = JSON.parse(formatError("UNAUTHORIZED", "nope"));
    assert.equal(j.error.code, "UNAUTHORIZED");
  });
});
