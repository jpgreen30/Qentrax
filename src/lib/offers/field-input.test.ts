import { describe, it, expect } from "vitest";
import { parseFieldInput, parseList, FIELD_KEY_PATTERN } from "./field-input";

function form(values: Record<string, string>) {
  return { get: (name: string) => (name in values ? values[name] : null) };
}

const BASE = { field_key: "roof_type", label: "Roof type", field_type: "text" };

function parse(over: Record<string, string> = {}) {
  return parseFieldInput(form({ ...BASE, ...over }));
}

describe("parseList", () => {
  it("splits on commas and newlines, trimming blanks", () => {
    expect(parseList("shingle, tile\nmetal")).toEqual(["shingle", "tile", "metal"]);
  });
  it("drops duplicates and empty entries", () => {
    expect(parseList("a,,a, b ,")).toEqual(["a", "b"]);
  });
  it("returns empty for blank input", () => {
    expect(parseList("   ")).toEqual([]);
  });
});

describe("field key validation", () => {
  it("mirrors the database CHECK on field_key", () => {
    expect(FIELD_KEY_PATTERN.test("zip_code")).toBe(true);
    expect(FIELD_KEY_PATTERN.test("a1")).toBe(true);
    expect(FIELD_KEY_PATTERN.test("Zip")).toBe(false);
    expect(FIELD_KEY_PATTERN.test("1zip")).toBe(false);
    expect(FIELD_KEY_PATTERN.test("zip-code")).toBe(false);
    expect(FIELD_KEY_PATTERN.test("zip code")).toBe(false);
  });

  it("rejects an invalid key with a message instead of hitting the constraint", () => {
    const r = parse({ field_key: "Roof Type" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("lowercase");
  });

  it("lowercases an otherwise valid key", () => {
    const r = parse({ field_key: "ROOF_TYPE" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.field_key).toBe("roof_type");
  });

  it("requires a key and a label", () => {
    const r = parseFieldInput(form({ field_type: "text" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("Field key"))).toBe(true);
      expect(r.errors.some((e) => e.includes("Label"))).toBe(true);
    }
  });
});

describe("type and enum rules", () => {
  it("rejects an unsupported field type", () => {
    const r = parse({ field_type: "geospatial" });
    expect(r.ok).toBe(false);
  });

  it("accepts every supported type", () => {
    for (const t of ["text","textarea","integer","decimal","boolean","date","datetime","phone","email","zip","url"]) {
      expect(parse({ field_type: t }).ok).toBe(true);
    }
    expect(parse({ field_type: "enum", enum_values: "a,b" }).ok).toBe(true);
    expect(parse({ field_type: "multi_enum", enum_values: "a" }).ok).toBe(true);
  });

  it("requires allowed values for an enum, matching the DB constraint", () => {
    const r = parse({ field_type: "enum" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("at least one allowed value");
  });

  it("rejects allowed values on a non-enum field", () => {
    const r = parse({ field_type: "text", enum_values: "a,b" });
    expect(r.ok).toBe(false);
  });

  it("stores enum values as a list and null for other types", () => {
    const e = parse({ field_type: "enum", enum_values: "shingle, tile" });
    expect(e.ok && e.value.enum_values).toEqual(["shingle", "tile"]);
    const t = parse({ field_type: "text" });
    expect(t.ok && t.value.enum_values).toBeNull();
  });
});

describe("validation bounds", () => {
  it("collects numeric bounds into validation_json", () => {
    const r = parse({ field_type: "integer", min: "50", max: "2000" });
    expect(r.ok && r.value.validation_json).toEqual({ min: 50, max: 2000 });
  });

  it("rejects a minimum above its maximum", () => {
    const r = parse({ field_type: "integer", min: "10", max: "5" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("Minimum cannot be greater");
  });

  it("rejects a minimum length above its maximum length", () => {
    const r = parse({ min_length: "10", max_length: "5" });
    expect(r.ok).toBe(false);
  });

  it("rejects a non-numeric bound", () => {
    expect(parse({ min: "abc" }).ok).toBe(false);
  });

  it("rejects a pattern that is not a valid regular expression", () => {
    const r = parse({ pattern: "[unclosed" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("regular expression");
  });

  it("keeps a valid pattern", () => {
    const r = parse({ pattern: "^9\\d{4}$" });
    expect(r.ok && r.value.validation_json.pattern).toBe("^9\\d{4}$");
  });

  it("omits absent bounds rather than storing nulls", () => {
    const r = parse({});
    expect(r.ok && r.value.validation_json).toEqual({});
  });
});

describe("flags and metadata", () => {
  it("reads checkbox flags", () => {
    const r = parse({ required: "on", is_pii: "on" });
    expect(r.ok && r.value.required).toBe(true);
    expect(r.ok && r.value.is_pii).toBe(true);
    const off = parse({});
    expect(off.ok && off.value.required).toBe(false);
  });

  it("defaults phase to post and consent to none", () => {
    const r = parse({});
    expect(r.ok && r.value.phase).toBe("post");
    expect(r.ok && r.value.consent_classification).toBe("none");
  });

  it("rejects an unknown phase or consent classification", () => {
    expect(parse({ phase: "sideways" }).ok).toBe(false);
    expect(parse({ consent_classification: "maybe" }).ok).toBe(false);
  });

  it("parses aliases into a deduplicated list", () => {
    const r = parse({ aliases: "phone_number, tel, tel" });
    expect(r.ok && r.value.aliases).toEqual(["phone_number", "tel"]);
  });

  it("rejects a fractional sort order", () => {
    expect(parse({ sort_order: "1.5" }).ok).toBe(false);
  });

  it("reports every problem at once rather than one at a time", () => {
    const r = parseFieldInput(form({ field_key: "Bad Key", field_type: "enum" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});
