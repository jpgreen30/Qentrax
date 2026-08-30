import { fieldsForPhase, type VerticalField } from "./types";

/**
 * Builds a valid example payload for one phase, derived from the field
 * definitions. Values satisfy the same constraints the generated JSON Schema
 * expresses, so an example copied from the docs validates as-is.
 *
 * Example values for PII fields are obviously synthetic; this output is public
 * documentation and must never carry real consumer data.
 */
export function exampleValueFor(field: VerticalField): unknown {
  if (field.default_value !== null && field.default_value !== undefined) {
    return field.default_value;
  }

  const v = field.validation_json ?? {};

  switch (field.field_type) {
    case "text":
    case "textarea": {
      const base = field.field_type === "text" ? "example" : "Example free-text response.";
      const min = typeof v.min_length === "number" ? v.min_length : 0;
      return base.length >= min ? base : base.padEnd(min, "x");
    }
    case "integer": {
      if (typeof v.min === "number") return v.min;
      if (typeof v.max === "number") return Math.min(1, v.max);
      return 1;
    }
    case "decimal": {
      if (typeof v.min === "number") return v.min;
      return 1.5;
    }
    case "boolean":
      return true;
    case "date":
      return "2026-01-15";
    case "datetime":
      return "2026-01-15T18:30:00Z";
    case "email":
      return "lead@example.com";
    case "url":
      return "https://example.com/landing";
    case "phone":
      // 555-01xx is reserved for fictional use.
      return "+13105550142";
    case "zip":
      return "90210";
    case "enum":
      return field.enum_values?.[0] ?? "";
    case "multi_enum":
      return field.enum_values?.slice(0, 1) ?? [];
  }
}

export function buildExamplePayload(
  fields: readonly VerticalField[],
  phase: "ping" | "post",
  options: { includeOptional?: boolean } = {},
): Record<string, unknown> {
  const includeOptional = options.includeOptional ?? true;
  const payload: Record<string, unknown> = {};

  for (const field of fieldsForPhase(fields, phase)) {
    if (!field.required && !includeOptional) continue;
    payload[field.field_key] = exampleValueFor(field);
  }

  return payload;
}
