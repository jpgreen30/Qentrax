import type { SupabaseClient } from "@supabase/supabase-js";
import { PRIMARY_VERTICAL_CODES } from "@/lib/verticals";

export type FieldSchemaRow = {
  vertical_code: string;
  product_code: string | null;
  phase: "ping" | "post" | "both";
  field_key: string;
  label: string;
  data_type: string;
  required: boolean;
  pii: boolean;
  enum_values_json: string[] | null;
};

export type FieldIssue = {
  field: string;
  phase: string;
  code: "MISSING" | "INVALID_TYPE" | "INVALID_ENUM" | "UNKNOWN_VERTICAL";
  message: string;
};

export type ValidatedIntake = {
  ok: boolean;
  issues: FieldIssue[];
  /** Non-PII attributes for auction matching */
  pingAttributes: Record<string, unknown>;
  /** Contact + consent (not stored in cleartext by default) */
  postAttributes: Record<string, unknown>;
  hasConsent: boolean;
};

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}

function typeOk(dataType: string, value: unknown): boolean {
  if (!isPresent(value)) return true;
  switch (dataType) {
    case "boolean":
      return typeof value === "boolean" || value === "true" || value === "false" || value === 0 || value === 1;
    case "number":
      return typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)));
    case "string":
    default:
      return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
  }
}

function normalizeBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  return false;
}

/**
 * Merge attributes + consumer + consent into one lookup bag.
 * consumer keys are treated as post-phase contact fields.
 */
export function flattenIntakePayload(input: {
  attributes?: Record<string, unknown>;
  consumer?: Record<string, unknown>;
  consent?: Record<string, unknown>;
}): Record<string, unknown> {
  const bag: Record<string, unknown> = { ...(input.attributes ?? {}) };
  const consumer = input.consumer ?? {};
  for (const [k, v] of Object.entries(consumer)) {
    bag[k] = v;
  }
  // common aliases
  if (consumer.first_name == null && consumer.firstName != null) bag.first_name = consumer.firstName;
  if (consumer.last_name == null && consumer.lastName != null) bag.last_name = consumer.lastName;
  if (consumer.phone == null && consumer.phoneNumber != null) bag.phone = consumer.phoneNumber;

  const consent = input.consent ?? {};
  if (consent.tcpa_text != null) bag.tcpa_text = consent.tcpa_text;
  if (consent.tcpaText != null) bag.tcpa_text = consent.tcpaText;
  if (consent.tcpa_consent != null) bag.tcpa_consent = consent.tcpa_consent;
  if (consent.accepted != null) bag.tcpa_consent = consent.accepted;
  if (consent.jornaya_lead_id != null) bag.jornaya_lead_id = consent.jornaya_lead_id;
  if (consent.trustedform_url != null) bag.trustedform_url = consent.trustedform_url;

  return bag;
}

export function validateAgainstSchemas(
  verticalCode: string,
  schemas: FieldSchemaRow[],
  bag: Record<string, unknown>,
  opts: { requirePost?: boolean } = {},
): ValidatedIntake {
  const issues: FieldIssue[] = [];
  const requirePost = opts.requirePost !== false;

  if (!PRIMARY_VERTICAL_CODES.includes(verticalCode as (typeof PRIMARY_VERTICAL_CODES)[number])) {
    // Still allow non-primary if schemas exist; otherwise flag
    if (!schemas.length) {
      issues.push({
        field: "vertical",
        phase: "ping",
        code: "UNKNOWN_VERTICAL",
        message: `Vertical '${verticalCode}' is not in the canonical catalog and has no field schema.`,
      });
      return { ok: false, issues, pingAttributes: {}, postAttributes: {}, hasConsent: false };
    }
  }

  const applicable = schemas.filter(
    (s) => s.phase === "ping" || s.phase === "post" || s.phase === "both",
  );

  const pingAttributes: Record<string, unknown> = {};
  const postAttributes: Record<string, unknown> = {};

  for (const row of applicable) {
    if (row.phase === "post" && !requirePost) continue;

    const value = bag[row.field_key];
    if (row.required && !isPresent(value)) {
      issues.push({
        field: row.field_key,
        phase: row.phase,
        code: "MISSING",
        message: `${row.label} (${row.field_key}) is required for ${row.phase}.`,
      });
      continue;
    }
    if (isPresent(value) && !typeOk(row.data_type, value)) {
      issues.push({
        field: row.field_key,
        phase: row.phase,
        code: "INVALID_TYPE",
        message: `${row.field_key} must be ${row.data_type}.`,
      });
      continue;
    }
    if (isPresent(value) && Array.isArray(row.enum_values_json) && row.enum_values_json.length) {
      const asString = String(value);
      if (!row.enum_values_json.map(String).includes(asString)) {
        issues.push({
          field: row.field_key,
          phase: row.phase,
          code: "INVALID_ENUM",
          message: `${row.field_key} must be one of: ${row.enum_values_json.join(", ")}.`,
        });
        continue;
      }
    }

    if (!isPresent(value)) continue;

    const normalized =
      row.data_type === "boolean"
        ? normalizeBool(value)
        : row.data_type === "number"
          ? Number(value)
          : value;

    if (row.phase === "ping" || row.phase === "both") {
      if (!row.pii) pingAttributes[row.field_key] = normalized;
    }
    if (row.phase === "post" || row.phase === "both") {
      postAttributes[row.field_key] = normalized;
    }
  }

  const hasConsent =
    normalizeBool(bag.tcpa_consent) ||
    (typeof bag.tcpa_text === "string" && bag.tcpa_text.trim().length > 0);

  return {
    ok: issues.length === 0,
    issues,
    pingAttributes,
    postAttributes,
    hasConsent,
  };
}

export async function loadFieldSchemas(
  supabase: SupabaseClient,
  verticalCode: string,
  productCode?: string | null,
): Promise<FieldSchemaRow[]> {
  let q = supabase
    .from("vertical_field_schemas")
    .select(
      "vertical_code, product_code, phase, field_key, label, data_type, required, pii, enum_values_json",
    )
    .eq("vertical_code", verticalCode)
    .eq("active", true);

  const { data, error } = await q;
  if (error || !data) return [];

  // Prefer product-specific rows when present, else product_code null (shared)
  const rows = data as FieldSchemaRow[];
  if (productCode) {
    const specific = rows.filter((r) => r.product_code === productCode);
    if (specific.length) return specific;
  }
  return rows.filter((r) => r.product_code == null || r.product_code === "");
}
