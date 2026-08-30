import { fieldsForPhase, type VerticalField } from "./types";

/**
 * Generates a JSON Schema (draft 2020-12) for one phase of an offer's payload
 * contract, derived from the published vertical schema version.
 *
 * This is the artifact a publisher integrates against, so it is generated from
 * the same field rows the router validates with rather than maintained by hand.
 */
export type JsonSchema = {
  $schema: string;
  $id?: string;
  title: string;
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  additionalProperties: boolean;
};

export type JsonSchemaProperty = {
  type?: string | string[];
  format?: string;
  description?: string;
  enum?: string[];
  items?: { type: string; enum?: string[] };
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: unknown;
  /** Non-standard annotations the docs surface. */
  "x-pii"?: boolean;
  "x-consent"?: string;
  "x-aliases"?: string[];
};

const US_ZIP = "^\\d{5}(-\\d{4})?$";
// E.164, which is what the router normalizes inbound numbers to.
const E164 = "^\\+?[1-9]\\d{7,14}$";

export function fieldToJsonSchemaProperty(field: VerticalField): JsonSchemaProperty {
  const v = field.validation_json ?? {};
  const prop: JsonSchemaProperty = {};

  switch (field.field_type) {
    case "text":
    case "textarea":
      prop.type = "string";
      break;
    case "integer":
      prop.type = "integer";
      break;
    case "decimal":
      prop.type = "number";
      break;
    case "boolean":
      prop.type = "boolean";
      break;
    case "date":
      prop.type = "string";
      prop.format = "date";
      break;
    case "datetime":
      prop.type = "string";
      prop.format = "date-time";
      break;
    case "email":
      prop.type = "string";
      prop.format = "email";
      break;
    case "url":
      prop.type = "string";
      prop.format = "uri";
      break;
    case "phone":
      prop.type = "string";
      prop.pattern = E164;
      break;
    case "zip":
      prop.type = "string";
      prop.pattern = US_ZIP;
      break;
    case "enum":
      prop.type = "string";
      prop.enum = field.enum_values ?? [];
      break;
    case "multi_enum":
      prop.type = "array";
      prop.items = { type: "string", enum: field.enum_values ?? [] };
      break;
  }

  if (field.description) prop.description = field.description;

  // An explicit pattern in validation overrides the type default.
  if (typeof v.pattern === "string") prop.pattern = v.pattern;
  if (typeof v.min === "number") prop.minimum = v.min;
  if (typeof v.max === "number") prop.maximum = v.max;
  if (typeof v.min_length === "number") prop.minLength = v.min_length;
  if (typeof v.max_length === "number") prop.maxLength = v.max_length;
  if (field.default_value !== null && field.default_value !== undefined) {
    prop.default = field.default_value;
  }

  if (field.is_pii) prop["x-pii"] = true;
  if (field.consent_classification !== "none") {
    prop["x-consent"] = field.consent_classification;
  }
  if (field.aliases.length) prop["x-aliases"] = [...field.aliases];

  return prop;
}

export function buildJsonSchema(
  fields: readonly VerticalField[],
  phase: "ping" | "post",
  meta: { offerSlug: string; offerVersion: number; schemaVersion: number },
): JsonSchema {
  const scoped = fieldsForPhase(fields, phase);
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  for (const field of scoped) {
    properties[field.field_key] = fieldToJsonSchemaProperty(field);
    if (field.required) required.push(field.field_key);
  }

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `https://qentrax.com/schemas/${meta.offerSlug}/v${meta.offerVersion}/${phase}.json`,
    title: `${meta.offerSlug} ${phase} payload (offer v${meta.offerVersion}, schema v${meta.schemaVersion})`,
    type: "object",
    properties,
    required,
    // Unknown keys are rejected so a publisher learns about a typo at
    // integration time rather than silently dropping data.
    additionalProperties: false,
  };
}
