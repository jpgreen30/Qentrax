import { describe, it, expect } from "vitest";
import { applyFieldMapping, readPath, writePath } from "./field-mapping";

const lead = {
  transaction_id: "txn_1",
  state: "CA",
  consumer: { email: "lead@example.com", phone: "+13105550142", name: { first: "Ada" } },
  attributes: { roof_type: "tile", monthly_bill: 180 },
};

describe("readPath", () => {
  it("reads top-level and nested values", () => {
    expect(readPath(lead, "state")).toBe("CA");
    expect(readPath(lead, "consumer.email")).toBe("lead@example.com");
    expect(readPath(lead, "consumer.name.first")).toBe("Ada");
  });

  it("returns undefined for a missing path rather than throwing", () => {
    expect(readPath(lead, "consumer.ssn")).toBeUndefined();
    expect(readPath(lead, "nope.deeper.still")).toBeUndefined();
    expect(readPath(lead, "")).toBeUndefined();
  });

  it("does not walk through a non-object", () => {
    expect(readPath(lead, "state.length")).toBeUndefined();
  });
});

describe("writePath", () => {
  it("writes nested destinations, creating intermediates", () => {
    const out: Record<string, unknown> = {};
    writePath(out, "properties.email", "x@y.z");
    expect(out).toEqual({ properties: { email: "x@y.z" } });
  });

  it("replaces a non-object intermediate rather than throwing", () => {
    const out: Record<string, unknown> = { properties: "scalar" };
    writePath(out, "properties.email", "x@y.z");
    expect(out).toEqual({ properties: { email: "x@y.z" } });
  });
});

describe("applyFieldMapping", () => {
  it("passes the payload through unchanged when no mapping is configured", () => {
    expect(applyFieldMapping(lead, null).payload).toEqual(lead);
    expect(applyFieldMapping(lead, {}).payload).toEqual(lead);
  });

  it("renames mapped fields to the destination's names", () => {
    const { payload } = applyFieldMapping(lead, {
      "consumer.email": "Email",
      "consumer.phone": "Phone",
      state: "State__c",
    });
    expect(payload).toEqual({
      Email: "lead@example.com",
      Phone: "+13105550142",
      State__c: "CA",
    });
  });

  it("sends only mapped fields, so unmapped PII does not leak", () => {
    const { payload } = applyFieldMapping(lead, { state: "State" });
    expect(payload).toEqual({ State: "CA" });
    expect(JSON.stringify(payload)).not.toContain("lead@example.com");
  });

  it("supports nested destination paths", () => {
    const { payload } = applyFieldMapping(lead, { "consumer.email": "properties.email" });
    expect(payload).toEqual({ properties: { email: "lead@example.com" } });
  });

  it("reports source fields the payload did not contain", () => {
    const { payload, missing } = applyFieldMapping(lead, {
      "consumer.email": "Email",
      "consumer.ssn": "SSN",
    });
    expect(missing).toEqual(["consumer.ssn"]);
    // A missing source must not emit a null the destination will reject.
    expect(payload).toEqual({ Email: "lead@example.com" });
    expect("SSN" in payload).toBe(false);
  });

  it("ignores half-configured mapping rows", () => {
    const { payload } = applyFieldMapping(lead, { state: "", "": "Email", "consumer.email": "E" });
    expect(payload).toEqual({ E: "lead@example.com" });
  });

  it("preserves value types rather than stringifying", () => {
    const { payload } = applyFieldMapping(lead, { "attributes.monthly_bill": "Bill" });
    expect(payload.Bill).toBe(180);
    expect(typeof payload.Bill).toBe("number");
  });

  it("does not mutate the source payload", () => {
    const snapshot = JSON.stringify(lead);
    applyFieldMapping(lead, { "consumer.email": "properties.email" });
    expect(JSON.stringify(lead)).toBe(snapshot);
  });
});
