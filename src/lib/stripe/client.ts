import Stripe from "stripe";

let _stripe: Stripe | null = null;

/** Server-only Stripe client. Throws if STRIPE_SECRET_KEY is missing. */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  // Omit apiVersion → stripe-node uses the version pinned to this SDK release
  _stripe = new Stripe(key, {
    typescript: true,
  });
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}
