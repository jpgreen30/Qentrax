/**
 * Lightweight field classification for data-minimization and future MCP boundaries.
 * Not a policy engine — labels only.
 */

export type PiiClass =
  | "NON_PII"
  | "CONTACT_PII"
  | "LOCATION_PII"
  | "CONSENT_DATA"
  | "PROVIDER_METADATA"
  | "FINANCIAL_DATA"
  | "INTERNAL_METADATA";

const CONTACT = new Set([
  "first_name",
  "last_name",
  "firstname",
  "lastname",
  "email",
  "phone",
  "phone_number",
  "address1",
  "address2",
  "city",
  "full_name",
  "ssn",
  "date_of_birth",
  "dob",
]);

const LOCATION = new Set(["zip", "zipcode", "zip_code", "state", "county", "geo"]);

const CONSENT = new Set([
  "tcpa_text",
  "tcpa_consent",
  "jornaya_lead_id",
  "trustedform_url",
  "trusted_form_url",
  "consent",
]);

const PROVIDER_META = new Set([
  "user_agent",
  "useragent",
  "ip",
  "ip_address",
  "session_id",
  "original_url",
  "source",
]);

const FINANCIAL = new Set([
  "bid_cents",
  "payout_cents",
  "revenue_cents",
  "publisher_amount_cents",
  "advertiser_price_cents",
]);

export function classifyField(fieldKey: string): PiiClass {
  const k = fieldKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (CONTACT.has(k)) return "CONTACT_PII";
  if (LOCATION.has(k)) return "LOCATION_PII";
  if (CONSENT.has(k)) return "CONSENT_DATA";
  if (PROVIDER_META.has(k)) return "PROVIDER_METADATA";
  if (FINANCIAL.has(k)) return "FINANCIAL_DATA";
  if (k.endsWith("_id") || k.startsWith("internal_")) return "INTERNAL_METADATA";
  return "NON_PII";
}

/** True if the field is contact-level consumer PII (name/email/phone/address). */
export function isContactPii(fieldKey: string): boolean {
  return classifyField(fieldKey) === "CONTACT_PII";
}

/** Strip contact PII from a payload bag (for preflight / demand discovery). */
export function stripContactPii(bag: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(bag)) {
    if (!isContactPii(k)) out[k] = v;
  }
  return out;
}
