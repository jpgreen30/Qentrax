/**
 * Deterministic Q-Score v1 — no AI, no fabricated verification.
 * Uses only signals present on the intake payload / validation result.
 */

export type QScoreComponent = {
  code: string;
  status: "pass" | "fail" | "unverified" | "unavailable";
  weight: number;
  points: number;
};

export type QScoreResult = {
  score: number;
  version: "qscore-v1";
  reason_codes: string[];
  components: QScoreComponent[];
};

function emailSyntaxOk(email: unknown): boolean {
  if (typeof email !== "string" || !email.trim()) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function phoneSyntaxOk(phone: unknown): boolean {
  if (typeof phone !== "string" && typeof phone !== "number") return false;
  const digits = String(phone).replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export function computeQScore(input: {
  schemaOk: boolean;
  hasConsent: boolean;
  attributes: Record<string, unknown>;
}): QScoreResult {
  const attrs = input.attributes ?? {};
  const components: QScoreComponent[] = [];

  const schema: QScoreComponent = {
    code: "SCHEMA_VALID",
    status: input.schemaOk ? "pass" : "fail",
    weight: 25,
    points: input.schemaOk ? 25 : 0,
  };
  components.push(schema);

  const consent: QScoreComponent = {
    code: "CONSENT_PRESENT",
    status: input.hasConsent ? "pass" : "fail",
    weight: 20,
    points: input.hasConsent ? 20 : 0,
  };
  components.push(consent);

  const emailRaw = attrs.email ?? attrs.Email;
  const emailOk = emailSyntaxOk(emailRaw);
  components.push({
    code: emailOk ? "EMAIL_SYNTAX_OK" : emailRaw ? "EMAIL_SYNTAX_BAD" : "EMAIL_MISSING",
    status: emailOk ? "pass" : emailRaw ? "fail" : "unverified",
    weight: 15,
    points: emailOk ? 15 : 0,
  });

  const phoneRaw = attrs.phone ?? attrs.PhoneNumber ?? attrs.phone_number;
  const phoneOk = phoneSyntaxOk(phoneRaw);
  components.push({
    code: phoneOk ? "PHONE_SYNTAX_OK" : phoneRaw ? "PHONE_SYNTAX_BAD" : "PHONE_MISSING",
    status: phoneOk ? "pass" : phoneRaw ? "fail" : "unverified",
    weight: 15,
    points: phoneOk ? 15 : 0,
  });

  const zip = attrs.zip ?? attrs.ZipCode ?? attrs.zip_code;
  const state = attrs.state ?? attrs.State;
  const geoOk = Boolean(zip) && Boolean(state);
  components.push({
    code: geoOk ? "GEO_PRESENT" : "GEO_INCOMPLETE",
    status: geoOk ? "pass" : "unverified",
    weight: 10,
    points: geoOk ? 10 : 0,
  });

  const addr =
    Boolean(attrs.address1 || attrs.Address1) &&
    Boolean(attrs.city || attrs.City) &&
    Boolean(zip);
  components.push({
    code: addr ? "ADDRESS_COMPLETE" : "ADDRESS_INCOMPLETE",
    status: addr ? "pass" : "unverified",
    weight: 10,
    points: addr ? 10 : 0,
  });

  // External verification not integrated — mark unavailable (do not fake)
  components.push({
    code: "PHONE_UNVERIFIED",
    status: "unavailable",
    weight: 5,
    points: 0,
  });

  const score = Math.min(
    100,
    components.reduce((s, c) => s + c.points, 0),
  );

  const reason_codes = components
    .filter((c) => c.status === "pass" || c.status === "unavailable" || c.status === "unverified")
    .map((c) => c.code);

  if (!input.schemaOk) reason_codes.unshift("SCHEMA_INVALID");
  if (!input.hasConsent) reason_codes.unshift("CONSENT_MISSING");

  return {
    score,
    version: "qscore-v1",
    reason_codes: Array.from(new Set(reason_codes)),
    components,
  };
}
