/**
 * Runtime environment helpers.
 * Simulation / dry-run paths must never produce billable production outcomes.
 */

export function isProductionRuntime(): boolean {
  // Vercel sets VERCEL_ENV; NODE_ENV is also set by Next.js.
  const vercelEnv = process.env.VERCEL_ENV ?? "";
  const nodeEnv = process.env.NODE_ENV ?? "";
  if (vercelEnv === "production" || nodeEnv === "production") return true;
  // Explicit override for safety in edge cases
  if (process.env.QENTRAX_FORCE_PRODUCTION === "1") return true;
  return false;
}

/**
 * Simulated delivery acceptance is allowed ONLY outside production.
 * Even if a caller passes simulateOnMissing=true, production always refuses.
 */
export function allowSimulatedDelivery(): boolean {
  if (isProductionRuntime()) return false;
  // Explicit opt-in for non-prod (default true in dev/test so local demos work)
  if (process.env.QENTRAX_ALLOW_SIMULATED_DELIVERY === "0") return false;
  return true;
}

/** PX credentials — server-side only. Never accept from client requests. */
export function getPxCredentials(): {
  apiToken: string | null;
  baseUrl: string;
} {
  const apiToken = (process.env.PX_API_TOKEN ?? "").trim() || null;
  const baseUrl = (process.env.PX_BASE_URL ?? "https://leadapi.px.com").replace(/\/$/, "");
  return { apiToken, baseUrl };
}

export function redactSecret(value: string | null | undefined): string {
  if (!value) return "[empty]";
  if (value.length <= 8) return "[redacted]";
  return `${value.slice(0, 4)}…[redacted]`;
}
