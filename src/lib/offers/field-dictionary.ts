import { toCsv } from "@/lib/reporting/csv";
import type { VerticalField } from "./types";

/**
 * CSV field dictionary for an offer's payload contract. Ordered by the schema's
 * own field order so it reads the same way as the builder and the docs.
 */
export const FIELD_DICTIONARY_HEADER = [
  "field_key",
  "label",
  "description",
  "type",
  "required",
  "phase",
  "pii",
  "consent_classification",
  "allowed_values",
  "validation",
  "aliases",
] as const;

export function buildFieldDictionaryCsv(fields: readonly VerticalField[]): string {
  const ordered = [...fields].sort(
    (a, b) => a.sort_order - b.sort_order || a.field_key.localeCompare(b.field_key),
  );

  return toCsv(
    [...FIELD_DICTIONARY_HEADER],
    ordered.map((f) => [
      f.field_key,
      f.label,
      f.description ?? "",
      f.field_type,
      f.required ? "required" : "optional",
      f.phase,
      f.is_pii ? "yes" : "no",
      f.consent_classification,
      (f.enum_values ?? []).join("|"),
      Object.keys(f.validation_json ?? {}).length
        ? JSON.stringify(f.validation_json)
        : "",
      f.aliases.join("|"),
    ]),
  );
}
