import type { ConsentClass, FieldPhase, VerticalFieldType } from "./types";

/**
 * Parsing and validation for the admin field builder.
 *
 * Kept out of the server action so the rules are testable directly and so the
 * same checks can be reused by an API path later. Errors are returned rather
 * than thrown: the builder re-renders the form with them.
 */
export const FIELD_TYPES: readonly VerticalFieldType[] = [
  "text", "textarea", "integer", "decimal", "boolean",
  "date", "datetime", "enum", "multi_enum",
  "phone", "email", "zip", "url",
];

export const FIELD_PHASES: readonly FieldPhase[] = ["ping", "post", "both"];

export const CONSENT_CLASSES: readonly ConsentClass[] = [
  "none", "consent_evidence", "sensitive", "regulated",
];

/** Mirrors the field_key_shape CHECK on public.vertical_fields. */
export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

export type FieldInput = {
  field_key: string;
  label: string;
  description: string | null;
  field_type: VerticalFieldType;
  required: boolean;
  phase: FieldPhase;
  is_pii: boolean;
  consent_classification: ConsentClass;
  enum_values: string[] | null;
  validation_json: Record<string, unknown>;
  aliases: string[];
  sort_order: number;
};

export type ParseResult =
  | { ok: true; value: FieldInput }
  | { ok: false; errors: string[] };

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Splits a comma or newline separated list, dropping blanks and duplicates. */
export function parseList(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[,\n]/)) {
    const v = part.trim();
    if (v) seen.add(v);
  }
  return [...seen];
}

export function parseFieldInput(form: {
  get(name: string): FormDataEntryValue | null;
}): ParseResult {
  const errors: string[] = [];

  const field_key = str(form.get("field_key")).toLowerCase();
  const label = str(form.get("label"));
  const rawType = str(form.get("field_type"));
  const rawPhase = str(form.get("phase")) || "post";
  const rawConsent = str(form.get("consent_classification")) || "none";

  if (!field_key) errors.push("Field key is required.");
  else if (!FIELD_KEY_PATTERN.test(field_key)) {
    errors.push(
      "Field key must start with a lowercase letter and contain only lowercase letters, digits and underscores.",
    );
  }

  if (!label) errors.push("Label is required.");

  if (!FIELD_TYPES.includes(rawType as VerticalFieldType)) {
    errors.push("Choose a supported field type.");
  }
  if (!FIELD_PHASES.includes(rawPhase as FieldPhase)) {
    errors.push("Phase must be ping, post or both.");
  }
  if (!CONSENT_CLASSES.includes(rawConsent as ConsentClass)) {
    errors.push("Choose a valid consent classification.");
  }

  const field_type = rawType as VerticalFieldType;
  const isEnum = field_type === "enum" || field_type === "multi_enum";
  const enumValues = parseList(str(form.get("enum_values")));

  // Mirrors the enum_values_present CHECK, so the builder reports the problem
  // instead of surfacing a constraint violation.
  if (isEnum && enumValues.length === 0) {
    errors.push("Enum fields need at least one allowed value.");
  }
  if (!isEnum && enumValues.length > 0) {
    errors.push("Allowed values apply only to enum and multi-enum fields.");
  }

  const validation: Record<string, unknown> = {};
  const numeric = (name: string) => {
    const raw = str(form.get(name));
    if (!raw) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      errors.push(`${name.replace(/_/g, " ")} must be a number.`);
      return undefined;
    }
    return n;
  };

  const min = numeric("min");
  const max = numeric("max");
  const minLength = numeric("min_length");
  const maxLength = numeric("max_length");
  const pattern = str(form.get("pattern"));

  if (min !== undefined) validation.min = min;
  if (max !== undefined) validation.max = max;
  if (minLength !== undefined) validation.min_length = minLength;
  if (maxLength !== undefined) validation.max_length = maxLength;
  if (pattern) {
    try {
      new RegExp(pattern);
      validation.pattern = pattern;
    } catch {
      errors.push("Validation pattern is not a valid regular expression.");
    }
  }

  if (min !== undefined && max !== undefined && min > max) {
    errors.push("Minimum cannot be greater than maximum.");
  }
  if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
    errors.push("Minimum length cannot be greater than maximum length.");
  }

  const sortRaw = str(form.get("sort_order"));
  const sort_order = sortRaw ? Number(sortRaw) : 0;
  if (!Number.isInteger(sort_order)) errors.push("Order must be a whole number.");

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      field_key,
      label,
      description: str(form.get("description")) || null,
      field_type,
      required: str(form.get("required")) === "on",
      phase: rawPhase as FieldPhase,
      is_pii: str(form.get("is_pii")) === "on",
      consent_classification: rawConsent as ConsentClass,
      enum_values: isEnum ? enumValues : null,
      validation_json: validation,
      aliases: parseList(str(form.get("aliases"))),
      sort_order,
    },
  };
}
