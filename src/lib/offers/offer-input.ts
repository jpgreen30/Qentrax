import type { GeoRules, LeadType, PricingMode } from "./types";

export const LEAD_TYPES: readonly LeadType[] = [
  "exclusive", "shared", "form", "call", "appointment", "transfer",
];

export const PRICING_MODES: readonly PricingMode[] = [
  "fixed", "floor", "bid", "auction", "ping_post",
];

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,80}$/;

const US_STATE = /^[A-Z]{2}$/;
const US_ZIP = /^\d{5}$/;

export type OfferVersionInput = {
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

export type OfferParseResult =
  | { ok: true; value: OfferVersionInput }
  | { ok: false; errors: string[] };

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

export function parseDollarsToCents(raw: string): number | undefined | null {
  const trimmed = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!trimmed) return undefined;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

export function parseCodeList(raw: string, normalize: (s: string) => string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[,\n\s]+/)) {
    const v = normalize(part.trim());
    if (v) seen.add(v);
  }
  return [...seen];
}

export function parseOfferVersionInput(form: {
  get(name: string): FormDataEntryValue | null;
}): OfferParseResult {
  const errors: string[] = [];

  const schema_version_id = str(form.get("schema_version_id"));
  const rawLeadType = str(form.get("lead_type"));
  const rawPricing = str(form.get("pricing_mode"));

  if (!schema_version_id) errors.push("A published schema version is required.");
  if (!LEAD_TYPES.includes(rawLeadType as LeadType)) errors.push("Choose a lead type.");
  if (!PRICING_MODES.includes(rawPricing as PricingMode)) errors.push("Choose a pricing mode.");

  const money = (name: string, label: string): number | null => {
    const parsed = parseDollarsToCents(str(form.get(name)));
    if (parsed === null) {
      errors.push(`${label} must be an amount like 45.00.`);
      return null;
    }
    return parsed ?? null;
  };

  const price_cents = money("price", "Price");
  const floor_cents = money("floor", "Floor");
  const ceiling_cents = money("ceiling", "Ceiling");
  const pricing_mode = rawPricing as PricingMode;

  if (pricing_mode === "fixed" && price_cents === null) {
    errors.push("A fixed-price offer needs a price.");
  }
  if (["floor", "bid", "auction"].includes(pricing_mode) && floor_cents === null) {
    errors.push(`A ${pricing_mode} offer needs a floor price.`);
  }
  if (ceiling_cents !== null && floor_cents !== null && ceiling_cents < floor_cents) {
    errors.push("Ceiling cannot be below the floor.");
  }

  const includeStates = parseCodeList(str(form.get("states_include")), (s) => s.toUpperCase());
  const excludeStates = parseCodeList(str(form.get("states_exclude")), (s) => s.toUpperCase());
  const includeZips = parseCodeList(str(form.get("zips_include")), (s) => s);
  const excludeZips = parseCodeList(str(form.get("zips_exclude")), (s) => s);

  for (const s of [...includeStates, ...excludeStates]) {
    if (!US_STATE.test(s)) errors.push(`"${s}" is not a two-letter state code.`);
  }
  for (const z of [...includeZips, ...excludeZips]) {
    if (!US_ZIP.test(z)) errors.push(`"${z}" is not a five-digit ZIP code.`);
  }
  for (const s of includeStates) {
    if (excludeStates.includes(s)) errors.push(`${s} is both included and excluded.`);
  }
  for (const z of includeZips) {
    if (excludeZips.includes(z)) errors.push(`${z} is both included and excluded.`);
  }

  const geo_rules_json: GeoRules = {};
  if (includeStates.length || excludeStates.length) {
    geo_rules_json.states = {};
    if (includeStates.length) geo_rules_json.states.include = includeStates;
    if (excludeStates.length) geo_rules_json.states.exclude = excludeStates;
  }
  if (includeZips.length || excludeZips.length) {
    geo_rules_json.zips = {};
    if (includeZips.length) geo_rules_json.zips.include = includeZips;
    if (excludeZips.length) geo_rules_json.zips.exclude = excludeZips;
  }

  const ageRaw = str(form.get("max_lead_age_minutes"));
  let max_lead_age_seconds: number | null = null;
  if (ageRaw) {
    const minutes = Number(ageRaw);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      errors.push("Maximum lead age must be a positive whole number of minutes.");
    } else {
      max_lead_age_seconds = minutes * 60;
    }
  }

  const requirements_json: Record<string, unknown> = {};
  const consentRequired = str(form.get("require_consent")) === "on";
  if (consentRequired) requirements_json.consent_required = true;
  const verification = str(form.get("verification"));
  if (verification) requirements_json.verification = verification;
  const fieldProfile = str(form.get("field_profile"));
  if (fieldProfile) requirements_json.field_profile = fieldProfile;
  const ageMin = str(form.get("age_min"));
  const ageMax = str(form.get("age_max"));
  if (ageMin || ageMax) {
    requirements_json.age = {
      min: ageMin ? Number(ageMin) : null,
      max: ageMax ? Number(ageMax) : null,
    };
  }
  const coverageMin = str(form.get("coverage_min"));
  if (coverageMin) requirements_json.coverage_min = Number(coverageMin.replace(/[$,]/g, ""));
  const minQuality = str(form.get("min_quality_score"));
  if (minQuality) {
    const n = Number(minQuality);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      errors.push("Minimum quality score must be a whole number between 0 and 100.");
    } else {
      requirements_json.min_quality_score = n;
    }
  }

  const return_policy_json: Record<string, unknown> = {};
  const returnWindow = str(form.get("return_window_hours"));
  if (returnWindow) {
    const n = Number(returnWindow);
    if (!Number.isInteger(n) || n < 0) {
      errors.push("Return window must be a whole number of hours.");
    } else {
      return_policy_json.window_hours = n;
    }
  }
  const returnReasons = parseCodeList(str(form.get("return_reasons")), (s) => s.toUpperCase());
  if (returnReasons.length) return_policy_json.accepted_reasons = returnReasons;

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      schema_version_id,
      lead_type: rawLeadType as LeadType,
      pricing_mode,
      price_cents,
      floor_cents,
      ceiling_cents,
      geo_rules_json,
      requirements_json,
      return_policy_json,
      max_lead_age_seconds,
    },
  };
}
