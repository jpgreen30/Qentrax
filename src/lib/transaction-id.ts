import { randomInt } from "crypto";

/**
 * Public marketplace transaction id, e.g. QL-90184.
 * Uses crypto.randomInt (CSPRNG) — never Math.random.
 * Uniqueness is enforced by opportunities.public_transaction_id UNIQUE.
 */
export function generatePublicTransactionId(): string {
  const n = randomInt(10000, 100000); // [10000, 99999]
  return `QL-${n}`;
}
