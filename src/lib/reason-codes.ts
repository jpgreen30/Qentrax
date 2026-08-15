export const REASON_CODE_FAMILIES = ["SCHEMA","IDENTITY","CONSENT","DUPLICATE","VELOCITY","GEO","ELIGIBILITY","CAMPAIGN","DELIVERY","RETURN","PAYMENT","PAYOUT","CONVERSION","AUTH"] as const;
export type ReasonCodeFamily = typeof REASON_CODE_FAMILIES[number];
export const REASON_CODES = {
  AUTH_REQUIRED: "Authentication is required.", AUTH_FORBIDDEN: "The actor lacks permission.",
  SCHEMA_INVALID: "The request does not match the supported schema.", CAMPAIGN_NOT_FUNDED: "Campaign requires available funds before activation.",
  CONSENT_MISSING: "Required consent evidence was not supplied.", DUPLICATE_CONSUMER: "Consumer was previously submitted within the configured window."
} as const;
export type ReasonCode = keyof typeof REASON_CODES;
export function isReasonCode(value: string): value is ReasonCode { return value in REASON_CODES; }
