import { describe, it, expect } from "vitest";
import { buildJsonSchema, fieldToJsonSchemaProperty } from "./json-schema";
import { buildExamplePayload, exampleValueFor } from "./examples";
import { buildFieldDictionaryCsv } from "./field-dictionary";
import { fieldsForPhase, type VerticalField, type VerticalFieldType } from "./types";

function field(over: Partial<VerticalField> & { field_key: string; field_type: VerticalFieldType }): VerticalField {
  return {
    label: over.field_key,
    description: null,
    required: false,
    phase: "post",
    is_pii: false,
    consent_classification: "none",
    enum_values: null,
    validation_json: {},
    default_value: null,
    aliases: [],
    sort_order: 0,
    ...over,
  };
}

const META = { offerSlug: "ca-solar-exclusive", offerVersion: 2, schemaVersion: 1 };

const SOLAR: VerticalField[] = [
  field({ field_key: "zip", field_type: "zip", required: true, phase: "ping", sort_order: 1 }),
  field({ field_key: "state", field_type: "text", required: true, phase: "ping", sort_order: 2 }),
  field({ field_key: "email", field_type: "email", required: true, phase: "post", is_pii: true, sort_order: 3 }),
  field({ field_key: "phone", field_type: "phone", required: true, phase: "post", is_pii: true,
          consent_classification: "consent_evidence", aliases: ["phone_number", "tel"], sort_order: 4 }),
  field({ field_key: "roof_type", field_type: "enum", enum_values: ["shingle", "tile", "metal"], sort_order: 5 }),
  field({ field_key: "monthly_bill", field_type: "integer", validation_json: { min: 50, max: 2000 }, sort_order: 6 }),
  field({ field_key: "homeowner", field_type: "boolean", required: true, phase: "both", sort_order: 7 }),
];

describe("phase scoping", () => {
  it("includes 'both' fields in each phase and excludes the other phase's fields", () => {
    const ping = fieldsForPhase(SOLAR, "ping").map((f) => f.field_key);
    const post = fieldsForPhase(SOLAR, "post").map((f) => f.field_key);
    expect(ping).toEqual(["zip", "state", "homeowner"]);
    expect(post).toContain("email");
    expect(post).toContain("homeowner");
    expect(post).not.toContain("zip");
  });

  it("orders fields by sort_order", () => {
    const shuffled = [...SOLAR].reverse();
    expect(fieldsForPhase(shuffled, "ping").map((f) => f.field_key)).toEqual([
      "zip", "state", "homeowner",
    ]);
  });
});

describe("buildJsonSchema", () => {
  it("maps each field type to its JSON Schema representation", () => {
    const t = (ft: VerticalFieldType, extra: Partial<VerticalField> = {}) =>
      fieldToJsonSchemaProperty(field({ field_key: "f", field_type: ft, ...extra }));

    expect(t("text").type).toBe("string");
    expect(t("integer").type).toBe("integer");
    expect(t("decimal").type).toBe("number");
    expect(t("boolean").type).toBe("boolean");
    expect(t("date")).toMatchObject({ type: "string", format: "date" });
    expect(t("datetime")).toMatchObject({ type: "string", format: "date-time" });
    expect(t("email")).toMatchObject({ type: "string", format: "email" });
    expect(t("url")).toMatchObject({ type: "string", format: "uri" });
    expect(t("zip").pattern).toBeDefined();
    expect(t("phone").pattern).toBeDefined();
    expect(t("enum", { enum_values: ["a", "b"] }).enum).toEqual(["a", "b"]);
    expect(t("multi_enum", { enum_values: ["a"] })).toMatchObject({
      type: "array",
      items: { type: "string", enum: ["a"] },
    });
  });

  it("lists exactly the required fields for the phase", () => {
    const schema = buildJsonSchema(SOLAR, "ping", META);
    expect(schema.required.sort()).toEqual(["homeowner", "state", "zip"]);
    expect(schema.required).not.toContain("roof_type");
  });

  it("rejects unknown keys so a publisher's typo surfaces at integration time", () => {
    expect(buildJsonSchema(SOLAR, "post", META).additionalProperties).toBe(false);
  });

  it("carries validation bounds through to the schema", () => {
    const schema = buildJsonSchema(SOLAR, "post", META);
    expect(schema.properties.monthly_bill).toMatchObject({ minimum: 50, maximum: 2000 });
  });

  it("annotates PII, consent classification and accepted aliases", () => {
    const schema = buildJsonSchema(SOLAR, "post", META);
    expect(schema.properties.email["x-pii"]).toBe(true);
    expect(schema.properties.phone["x-consent"]).toBe("consent_evidence");
    expect(schema.properties.phone["x-aliases"]).toEqual(["phone_number", "tel"]);
    expect(schema.properties.roof_type["x-pii"]).toBeUndefined();
  });

  it("identifies the offer and schema version it was generated from", () => {
    const schema = buildJsonSchema(SOLAR, "ping", META);
    expect(schema.$id).toContain("ca-solar-exclusive");
    expect(schema.$id).toContain("v2");
    expect(schema.title).toContain("schema v1");
  });

  it("lets an explicit validation pattern override the type default", () => {
    const custom = field({
      field_key: "zip", field_type: "zip", validation_json: { pattern: "^9\\d{4}$" },
    });
    expect(fieldToJsonSchemaProperty(custom).pattern).toBe("^9\\d{4}$");
  });

  it("produces an empty-but-valid schema when no field applies to the phase", () => {
    const schema = buildJsonSchema([field({ field_key: "a", field_type: "text", phase: "post" })], "ping", META);
    expect(schema.properties).toEqual({});
    expect(schema.required).toEqual([]);
  });
});

describe("example payloads", () => {
  it("includes every field for the phase", () => {
    const payload = buildExamplePayload(SOLAR, "ping");
    expect(Object.keys(payload).sort()).toEqual(["homeowner", "state", "zip"]);
  });

  it("can emit a required-only payload", () => {
    const payload = buildExamplePayload(SOLAR, "post", { includeOptional: false });
    expect(Object.keys(payload)).not.toContain("roof_type");
    expect(Object.keys(payload)).toContain("email");
  });

  it("picks an allowed value for enum fields", () => {
    expect(exampleValueFor(field({ field_key: "r", field_type: "enum", enum_values: ["tile", "metal"] })))
      .toBe("tile");
    expect(exampleValueFor(field({ field_key: "r", field_type: "multi_enum", enum_values: ["a", "b"] })))
      .toEqual(["a"]);
  });

  it("respects a declared minimum rather than emitting an out-of-range value", () => {
    expect(exampleValueFor(field({ field_key: "n", field_type: "integer", validation_json: { min: 50 } })))
      .toBe(50);
  });

  it("prefers the field's declared default", () => {
    expect(exampleValueFor(field({ field_key: "s", field_type: "text", default_value: "seeded" })))
      .toBe("seeded");
  });

  it("uses reserved fictional values for PII fields", () => {
    expect(exampleValueFor(field({ field_key: "p", field_type: "phone" }))).toContain("555");
    expect(exampleValueFor(field({ field_key: "e", field_type: "email" }))).toContain("example.com");
  });

  // The documented example is worthless if it fails the documented schema.
  it("emits examples that satisfy the generated schema", () => {
    for (const phase of ["ping", "post"] as const) {
      const schema = buildJsonSchema(SOLAR, phase, META);
      const payload = buildExamplePayload(SOLAR, phase);

      for (const key of schema.required) {
        expect(payload).toHaveProperty(key);
      }
      for (const key of Object.keys(payload)) {
        expect(schema.properties).toHaveProperty(key);
      }

      for (const [key, value] of Object.entries(payload)) {
        const prop = schema.properties[key];
        if (prop.type === "integer") {
          expect(Number.isInteger(value)).toBe(true);
          if (prop.minimum !== undefined) expect(value as number).toBeGreaterThanOrEqual(prop.minimum);
          if (prop.maximum !== undefined) expect(value as number).toBeLessThanOrEqual(prop.maximum);
        }
        if (prop.type === "boolean") expect(typeof value).toBe("boolean");
        if (prop.enum) expect(prop.enum).toContain(value as string);
        if (prop.pattern) expect(String(value)).toMatch(new RegExp(prop.pattern));
        if (prop.format === "date") expect(String(value)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});

describe("field dictionary CSV", () => {
  it("emits a header and one row per field in schema order", () => {
    const lines = buildFieldDictionaryCsv(SOLAR).trim().split("\r\n");
    expect(lines[0]).toContain("field_key");
    expect(lines).toHaveLength(SOLAR.length + 1);
    expect(lines[1].startsWith("zip,")).toBe(true);
  });

  it("spells out required/optional and PII rather than raw booleans", () => {
    const csv = buildFieldDictionaryCsv([
      field({ field_key: "email", field_type: "email", required: true, is_pii: true }),
    ]);
    expect(csv).toContain("required");
    expect(csv).toContain("yes");
  });

  it("renders allowed values and aliases as pipe-delimited lists", () => {
    const csv = buildFieldDictionaryCsv([
      field({ field_key: "r", field_type: "enum", enum_values: ["a", "b"], aliases: ["x", "y"] }),
    ]);
    expect(csv).toContain("a|b");
    expect(csv).toContain("x|y");
  });

  it("quotes a description containing a comma", () => {
    const csv = buildFieldDictionaryCsv([
      field({ field_key: "n", field_type: "text", description: "Name, full" }),
    ]);
    expect(csv).toContain('"Name, full"');
  });
});
