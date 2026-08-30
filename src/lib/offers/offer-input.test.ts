import { describe, it, expect } from "vitest";
import {
  parseOfferVersionInput,
  parseDollarsToCents,
  parseCodeList,
  SLUG_PATTERN,
} from "./offer-input";

function form(values: Record<string, string>) {
  return { get: (n: string) => (n in values ? values[n] : null) };
}

const BASE = {
  schema_version_id: "11111111-1111-1111-1111-111111111111",
  lead_type: "exclusive",
  pricing_mode: "fixed",
  price: "45.00",
};

const parse = (over: Record<string, string> = {}) =>
  parseOfferVersionInput(form({ ...BASE, ...over }));

describe("parseDollarsToCents", () => {
  it("converts dollar amounts to integer cents", () => {
    expect(parseDollarsToCents("45")).toBe(4500);
    expect(parseDollarsToCents("45.5")).toBe(4550);
    expect(parseDollarsToCents("45.15")).toBe(4515);
    expect(parseDollarsToCents("0")).toBe(0);
  });

  it("avoids binary floating-point drift", () => {
    // 45.15 * 100 is 4514.999... in IEEE 754.
    expect(parseDollarsToCents("45.15")).toBe(4515);
    expect(parseDollarsToCents("1.10")).toBe(110);
    expect(Number.isInteger(parseDollarsToCents("19.99"))).toBe(true);
  });

  it("accepts a leading dollar sign and thousands separators", () => {
    expect(parseDollarsToCents("$1,250.00")).toBe(125000);
  });

  it("returns undefined for blank and null for unparseable input", () => {
    expect(parseDollarsToCents("")).toBeUndefined();
    expect(parseDollarsToCents("   ")).toBeUndefined();
    expect(parseDollarsToCents("free")).toBeNull();
    expect(parseDollarsToCents("45.999")).toBeNull();
    expect(parseDollarsToCents("-5")).toBeNull();
  });
});

describe("parseCodeList", () => {
  it("splits on commas, whitespace and newlines and deduplicates", () => {
    expect(parseCodeList("ca, ny\ntx ca", (s) => s.toUpperCase())).toEqual(["CA", "NY", "TX"]);
  });
  it("returns empty for blank input", () => {
    expect(parseCodeList("  ", (s) => s)).toEqual([]);
  });
});

describe("slug shape", () => {
  it("mirrors the database CHECK", () => {
    expect(SLUG_PATTERN.test("ca-solar-exclusive")).toBe(true);
    expect(SLUG_PATTERN.test("Ca-Solar")).toBe(false);
    expect(SLUG_PATTERN.test("-leading")).toBe(false);
    expect(SLUG_PATTERN.test("a")).toBe(false);
  });
});

describe("pricing rules", () => {
  it("accepts a fixed-price offer and stores cents", () => {
    const r = parse();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.price_cents).toBe(4500);
  });

  it("requires a price for a fixed-price offer", () => {
    const r = parse({ price: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("needs a price");
  });

  it("requires a floor for floor, bid and auction modes", () => {
    for (const mode of ["floor", "bid", "auction"]) {
      const r = parse({ pricing_mode: mode, price: "" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(" ")).toContain("floor price");
    }
  });

  it("accepts ping_post without either price", () => {
    expect(parse({ pricing_mode: "ping_post", price: "" }).ok).toBe(true);
  });

  it("rejects a ceiling below the floor", () => {
    const r = parse({ pricing_mode: "floor", price: "", floor: "50.00", ceiling: "10.00" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("Ceiling cannot be below");
  });

  it("accepts a ceiling equal to the floor", () => {
    expect(parse({ pricing_mode: "floor", price: "", floor: "50.00", ceiling: "50.00" }).ok).toBe(true);
  });

  it("rejects a malformed amount", () => {
    expect(parse({ price: "forty five" }).ok).toBe(false);
  });

  it("rejects an unknown lead type or pricing mode", () => {
    expect(parse({ lead_type: "carrier_pigeon" }).ok).toBe(false);
    expect(parse({ pricing_mode: "haggle" }).ok).toBe(false);
  });

  it("accepts every supported lead type", () => {
    for (const t of ["exclusive","shared","form","call","appointment","transfer"]) {
      expect(parse({ lead_type: t }).ok).toBe(true);
    }
  });
});

describe("geography rules", () => {
  it("normalizes state codes to upper case", () => {
    const r = parse({ states_include: "ca, ny" });
    expect(r.ok && r.value.geo_rules_json.states?.include).toEqual(["CA", "NY"]);
  });

  it("rejects a malformed state or ZIP", () => {
    expect(parse({ states_include: "California" }).ok).toBe(false);
    expect(parse({ zips_include: "9021" }).ok).toBe(false);
  });

  it("rejects a code that is both included and excluded", () => {
    const r = parse({ states_include: "CA,NY", states_exclude: "CA" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("both included and excluded");
  });

  it("omits geo rules entirely when none are given", () => {
    const r = parse();
    expect(r.ok && r.value.geo_rules_json).toEqual({});
  });

  it("carries include and exclude lists together", () => {
    const r = parse({ states_include: "CA", zips_exclude: "90210" });
    expect(r.ok && r.value.geo_rules_json).toEqual({
      states: { include: ["CA"] },
      zips: { exclude: ["90210"] },
    });
  });
});

describe("requirements and return policy", () => {
  it("converts lead age from minutes to seconds", () => {
    const r = parse({ max_lead_age_minutes: "30" });
    expect(r.ok && r.value.max_lead_age_seconds).toBe(1800);
  });

  it("rejects a zero or fractional lead age", () => {
    expect(parse({ max_lead_age_minutes: "0" }).ok).toBe(false);
    expect(parse({ max_lead_age_minutes: "1.5" }).ok).toBe(false);
  });

  it("records consent, verification and quality requirements", () => {
    const r = parse({ require_consent: "on", verification: "phone_verified", min_quality_score: "80" });
    expect(r.ok && r.value.requirements_json).toEqual({
      consent_required: true,
      verification: "phone_verified",
      min_quality_score: 80,
    });
  });

  it("rejects a quality score outside 0-100", () => {
    expect(parse({ min_quality_score: "101" }).ok).toBe(false);
    expect(parse({ min_quality_score: "-1" }).ok).toBe(false);
  });

  it("records the return window and accepted reasons", () => {
    const r = parse({ return_window_hours: "72", return_reasons: "duplicate, invalid_phone" });
    expect(r.ok && r.value.return_policy_json).toEqual({
      window_hours: 72,
      accepted_reasons: ["DUPLICATE", "INVALID_PHONE"],
    });
  });

  it("leaves requirements and return policy empty when unspecified", () => {
    const r = parse();
    expect(r.ok && r.value.requirements_json).toEqual({});
    expect(r.ok && r.value.return_policy_json).toEqual({});
  });

  it("reports every problem at once", () => {
    const r = parseOfferVersionInput(form({ lead_type: "bad", pricing_mode: "fixed" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});
