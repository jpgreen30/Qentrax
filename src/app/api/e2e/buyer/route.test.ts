import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("buyer e2e webhook sink", () => {
  it("accepts a well-formed delivery payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/e2e/buyer", {
        method: "POST",
        body: JSON.stringify({
          transaction_id: "txn-1",
          opportunity_id: "opp-1",
          campaign_id: "camp-1",
          vertical: "solar",
          consumer: { email: "lead@example.com" },
          attributes: { state: "CA" },
          delivered_at: "2026-08-30T00:00:00.000Z",
        }),
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      accepted: true,
    });
  });

  it("rejects a missing payload body", async () => {
    const response = await POST(
      new Request("http://localhost/api/e2e/buyer", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "invalid_json",
    });
  });
});
