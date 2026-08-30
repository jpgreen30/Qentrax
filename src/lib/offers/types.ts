/** Mirrors public.vertical_field_type. */
export type VerticalFieldType =
  | "text" | "textarea" | "integer" | "decimal" | "boolean"
  | "date" | "datetime" | "enum" | "multi_enum"
  | "phone" | "email" | "zip" | "url";

/** Mirrors public.field_phase. */
export type FieldPhase = "ping" | "post" | "both";

/** Mirrors public.consent_class. */
export type ConsentClass = "none" | "consent_evidence" | "sensitive" | "regulated";

export type VerticalField = {
  field_key: string;
  label: string;
  description: string | null;
  field_type: VerticalFieldType;
  required: boolean;
  phase: FieldPhase;
  is_pii: boolean;
  consent_classification: ConsentClass;
  enum_values: string[] | null;
  validation_json: FieldValidation;
  default_value: unknown;
  aliases: string[];
  sort_order: number;
};

export type FieldValidation = {
  min?: number;
  max?: number;
  min_length?: number;
  max_length?: number;
  pattern?: string;
  [key: string]: unknown;
};

export type LeadType =
  | "exclusive" | "shared" | "form" | "call" | "appointment" | "transfer";

export type PricingMode = "fixed" | "floor" | "bid" | "auction" | "ping_post";

export type OfferVersion = {
  id: string;
  version: number;
  schema_version_id: string;
  lead_type: LeadType;
  pricing_mode: PricingMode;
  price_cents: number | null;
  floor_cents: number | null;
  ceiling_cents: number | null;
  geo_rules_json: GeoRules;
  requirements_json: Record<string, unknown>;
  return_policy_json: Record<string, unknown>;
  max_lead_age_seconds: number | null;
};

export type GeoRules = {
  states?: { include?: string[]; exclude?: string[] };
  zips?: { include?: string[]; exclude?: string[] };
};

/** A field is in scope for a phase when it is that phase or "both". */
export function fieldAppliesTo(field: VerticalField, phase: "ping" | "post"): boolean {
  return field.phase === phase || field.phase === "both";
}

export function fieldsForPhase(
  fields: readonly VerticalField[],
  phase: "ping" | "post",
): VerticalField[] {
  return fields
    .filter((f) => fieldAppliesTo(f, phase))
    .sort((a, b) => a.sort_order - b.sort_order || a.field_key.localeCompare(b.field_key));
}
