/** Structured redaction for logs and error snapshots — minimize PII / secrets. */

const EMAIL_RE = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const PHONE_RE = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const SECRET_KEY_RE =
  /("?((?:api[_-]?key|api[_-]?token|token|authorization|password|secret|bearer))"?\s*[:=]\s*")[^"]+"/gi;

export function redactText(input: string, max = 800): string {
  return input
    .slice(0, max)
    .replace(EMAIL_RE, "[email]")
    .replace(PHONE_RE, "[phone]")
    .replace(SECRET_KEY_RE, '$1[redacted]"');
}

export function redactRecord(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const sensitive = new Set([
    "email",
    "phone",
    "phonenumber",
    "first_name",
    "firstname",
    "last_name",
    "lastname",
    "address1",
    "address",
    "api_token",
    "apitoken",
    "authorization",
    "password",
    "secret",
    "stripe_secret",
  ]);
  for (const [k, v] of Object.entries(obj)) {
    if (sensitive.has(k.toLowerCase())) {
      out[k] = "[redacted]";
    } else if (typeof v === "string") {
      out[k] = redactText(v, 200);
    } else {
      out[k] = v;
    }
  }
  return out;
}
