export const REASON_CODE_FAMILIES = [
  "SCHEMA",
  "IDENTITY",
  "CONSENT",
  "DUPLICATE",
  "VELOCITY",
  "GEO",
  "ELIGIBILITY",
  "CAMPAIGN",
  "DELIVERY",
  "RETURN",
  "PAYMENT",
  "PAYOUT",
  "CONVERSION",
  "AUTH",
] as const;

export type ReasonCodeFamily = (typeof REASON_CODE_FAMILIES)[number];

/** Stable machine-readable reason codes. Human descriptions may change; codes may not be repurposed. */
export const REASON_CODES = {
  AUTH_REQUIRED: "Authentication is required.",
  AUTH_FORBIDDEN: "The actor lacks permission.",
  SCHEMA_INVALID: "The request does not match the supported schema.",
  SCHEMA_MISSING_FIELD: "A required field is missing.",
  IDENTITY_INVALID: "Identity or contact check failed.",
  CONSENT_MISSING: "Required consent evidence was not supplied.",
  CONSENT_INVALID: "Consent evidence is invalid or unverifiable.",
  DUPLICATE_CONSUMER: "Consumer was previously submitted within the configured window.",
  VELOCITY_EXCEEDED: "Submission rate exceeded the configured threshold.",
  GEO_MISMATCH: "Geography does not match campaign or source rules.",
  ELIGIBILITY_MISMATCH: "Vertical, product, or buyer-rule mismatch.",
  CAMPAIGN_NOT_FUNDED: "Campaign requires available funds before activation.",
  CAMPAIGN_INACTIVE: "Campaign is not active or is outside schedule.",
  CAMPAIGN_CAP_REACHED: "Campaign has reached a configured cap.",
  DELIVERY_TIMEOUT: "Delivery timed out.",
  DELIVERY_REJECTED: "Buyer rejected the delivery.",
  RETURN_WINDOW_EXPIRED: "Return window has expired.",
  PAYMENT_FAILED: "Payment processor reported failure.",
  PAYOUT_BELOW_THRESHOLD: "Payable balance is below the configured threshold.",
  CONVERSION_UNATTRIBUTED: "Conversion event could not be attributed to a known transaction.",
} as const;

export type ReasonCode = keyof typeof REASON_CODES;

export function isReasonCode(value: string): value is ReasonCode {
  return value in REASON_CODES;
}

export function reasonCodeMessage(code: ReasonCode): string {
  return REASON_CODES[code];
}
