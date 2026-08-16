/**
 * Environment helpers — production vs explicit non-prod sandboxes.
 * Simulation / demo-accept paths must only run outside production.
 */
export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" && process.env.QENTRAX_ALLOW_SIMULATION !== "1";
}

/** Explicit opt-in for simulated delivery accepts (dev/test/sandbox only). */
export function allowSimulatedDelivery(): boolean {
  if (process.env.QENTRAX_ALLOW_SIMULATION === "1") return true;
  if (process.env.NODE_ENV === "test") return true;
  if (process.env.NODE_ENV === "development") return true;
  return false;
}
