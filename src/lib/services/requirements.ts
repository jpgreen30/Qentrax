/**
 * Requirements discovery — non-destructive.
 * Answers: "What fields do I need to submit for vertical X?"
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyField, type PiiClass } from "@/lib/pii";

export type RequirementField = {
  field_key: string;
  label: string;
  phase: "ping" | "post" | "both";
  data_type: string;
  required: boolean;
  pii: boolean;
  pii_class: PiiClass;
  enum_values: string[] | null;
  description: string | null;
};

export type GetRequirementsResult = {
  ok: true;
  vertical: string;
  product: string | null;
  required_fields: RequirementField[];
  optional_fields: RequirementField[];
  consent: {
    required: boolean;
    fields: string[];
  };
  geography: {
    state_required: boolean;
    zip_required: boolean;
  };
  source_restrictions: string[];
} | {
  ok: false;
  error: { code: string; message: string };
};

export async function getRequirements(
  supabase: SupabaseClient,
  vertical: string,
  product?: string | null,
): Promise<GetRequirementsResult> {
  const code = (vertical ?? "").trim().toLowerCase();
  if (!code) {
    return {
      ok: false,
      error: { code: "INVALID_REQUEST", message: "vertical is required." },
    };
  }

  const { data: vert } = await supabase
    .from("verticals")
    .select("id, code, name, active")
    .eq("code", code)
    .maybeSingle();

  if (!vert || !vert.active) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_VERTICAL",
        message: `Unknown or inactive vertical '${code}'.`,
      },
    };
  }

  let schemaQuery = supabase
    .from("vertical_field_schemas")
    .select(
      "field_key, label, phase, data_type, required, pii, enum_values_json, description, product_code, sort_order",
    )
    .eq("vertical_code", code)
    .eq("active", true)
    .order("sort_order");

  const { data: schemas, error } = await schemaQuery;
  if (error) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    };
  }

  const productCode = product?.trim() || null;
  const filtered = (schemas ?? []).filter((s) => {
    if (!s.product_code) return true; // vertical-level
    if (!productCode) return true; // no product filter → include all
    return s.product_code === productCode;
  });

  const required_fields: RequirementField[] = [];
  const optional_fields: RequirementField[] = [];
  const consentFields: string[] = [];
  let stateRequired = false;
  let zipRequired = false;

  for (const s of filtered) {
    const phase = s.phase as "ping" | "post" | "both";
    const field: RequirementField = {
      field_key: s.field_key,
      label: s.label,
      phase,
      data_type: s.data_type,
      required: s.required,
      pii: s.pii,
      pii_class: classifyField(s.field_key),
      enum_values: Array.isArray(s.enum_values_json)
        ? (s.enum_values_json as string[])
        : null,
      description: s.description ?? null,
    };

    if (s.required) required_fields.push(field);
    else optional_fields.push(field);

    const key = s.field_key.toLowerCase();
    if (key.includes("tcpa") || key.includes("consent") || key.includes("jornaya") || key.includes("trustedform")) {
      consentFields.push(s.field_key);
    }
    if (s.required && (key === "state")) stateRequired = true;
    if (s.required && (key === "zip" || key === "zipcode")) zipRequired = true;
  }

  return {
    ok: true,
    vertical: code,
    product: productCode,
    required_fields,
    optional_fields,
    consent: {
      required: consentFields.some((f) =>
        required_fields.some((r) => r.field_key === f),
      ),
      fields: [...new Set(consentFields)],
    },
    geography: {
      state_required: stateRequired,
      zip_required: zipRequired,
    },
    source_restrictions: [],
  };
}
