import type { SupabaseClient } from "@supabase/supabase-js";
import { fieldsForPhase, type VerticalField } from "@/lib/offers/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { publisherAmountCents } from "./revenue-share";

/**
 * Publisher-facing demand discovery, built on the published Offer domain.
 *
 * A publisher needs to know what they may send and what they will be paid
 * before integrating. Everything here derives from the offer version and the
 * schema version it froze at publish, so the intake documentation cannot drift
 * from what the router actually validates.
 *
 * Only offers with at least one campaign currently buying are listed: demand a
 * publisher cannot actually sell into is noise.
 */
export type DemandFieldSummary = {
  field_key: string;
  label: string;
  description: string | null;
  type: string;
  required: boolean;
  allowed_values: string[] | null;
  is_pii: boolean;
  consent_classification: string;
};

export type PublisherDemandOffer = {
  offer_id: string;
  offer_slug: string;
  offer_name: string;
  offer_version: number;
  schema_version: number | null;
  vertical_code: string | null;
  vertical_name: string | null;
  lead_type: string;
  pricing_mode: string;
  /** What the publisher is paid, not what the advertiser is charged. */
  publisher_rate_cents: number | null;
  /** True when the rate varies by auction rather than being fixed. */
  rate_is_indicative: boolean;
  states: string[] | null;
  excluded_states: string[] | null;
  consent_required: boolean;
  verification: string | null;
  min_quality_score: number | null;
  max_lead_age_seconds: number | null;
  return_window_hours: number | null;
  ping_fields: DemandFieldSummary[];
  post_fields: DemandFieldSummary[];
  /** Campaigns actively buying this offer right now. */
  active_campaigns: number;
};

function summarize(field: VerticalField): DemandFieldSummary {
  return {
    field_key: field.field_key,
    label: field.label,
    description: field.description,
    type: field.field_type,
    required: field.required,
    allowed_values: field.enum_values,
    is_pii: field.is_pii,
    consent_classification: field.consent_classification,
  };
}

/**
 * The rate a publisher can expect. For a fixed-price offer this is exact. For
 * floor/bid/auction pricing the floor is the guaranteed minimum, so it is
 * quoted as indicative rather than promised.
 */
export function quotePublisherRate(version: {
  pricing_mode: string;
  price_cents: number | null;
  floor_cents: number | null;
}): { cents: number | null; indicative: boolean } {
  if (version.pricing_mode === "fixed" && version.price_cents != null) {
    return { cents: publisherAmountCents(version.price_cents), indicative: false };
  }
  if (version.floor_cents != null) {
    return { cents: publisherAmountCents(version.floor_cents), indicative: true };
  }
  return { cents: null, indicative: true };
}

type OfferRow = {
  id: string;
  slug: string;
  name: string;
  verticals: { code: string; name: string } | null;
  offer_versions: {
    id: string;
    version: number;
    lead_type: string;
    pricing_mode: string;
    price_cents: number | null;
    floor_cents: number | null;
    geo_rules_json: {
      states?: { include?: string[]; exclude?: string[] };
    } | null;
    requirements_json: Record<string, unknown> | null;
    return_policy_json: Record<string, unknown> | null;
    max_lead_age_seconds: number | null;
    schema_version_id: string;
  } | null;
};

export async function listPublisherDemand(
  supabase: SupabaseClient,
  opts: { verticalId?: string | null; state?: string | null } = {},
): Promise<PublisherDemandOffer[]> {
  // RLS restricts this to published offers and published versions.
  let query = supabase
    .from("offers")
    .select(
      `id, slug, name,
       verticals ( code, name ),
       offer_versions!offers_current_version_id_fkey (
         id, version, lead_type, pricing_mode, price_cents, floor_cents,
         geo_rules_json, requirements_json, return_policy_json,
         max_lead_age_seconds, schema_version_id
       )`,
    )
    .eq("status", "published");

  if (opts.verticalId) query = query.eq("vertical_id", opts.verticalId);

  const { data, error } = await query;
  if (error) throw error;

  const offers = (data ?? []) as unknown as OfferRow[];
  const withVersion = offers.filter((o) => o.offer_versions != null);
  if (!withVersion.length) return [];

  const schemaIds = [
    ...new Set(withVersion.map((o) => o.offer_versions!.schema_version_id)),
  ];

  const [{ data: schemaVersions }, { data: fieldRows }] =
    await Promise.all([
      supabase
        .from("vertical_schema_versions")
        .select("id, version")
        .in("id", schemaIds),
      supabase
        .from("vertical_fields")
        .select(
          `schema_version_id, field_key, label, description, field_type, required,
           phase, is_pii, consent_classification, enum_values, validation_json,
           default_value, aliases, sort_order`,
        )
        .in("schema_version_id", schemaIds)
        .order("sort_order"),
    ]);

  const schemaVersionNumber = new Map(
    (schemaVersions ?? []).map((s) => [s.id as string, s.version as number]),
  );

  const fieldsBySchema = new Map<string, VerticalField[]>();
  for (const row of (fieldRows ?? []) as unknown as (VerticalField & {
    schema_version_id: string;
  })[]) {
    const list = fieldsBySchema.get(row.schema_version_id) ?? [];
    list.push(row);
    fieldsBySchema.set(row.schema_version_id, list);
  }

  const campaignCount = new Map<string, number>();
  const campaignCountRows = await loadCampaignCounts(supabase);
  for (const c of campaignCountRows) {
    campaignCount.set(c.offer_id, Number(c.active_campaigns));
  }

  const results: PublisherDemandOffer[] = [];

  for (const offer of withVersion) {
    const version = offer.offer_versions!;
    const active = campaignCount.get(offer.id) ?? 0;
    if (active === 0) continue;

    const states = version.geo_rules_json?.states?.include ?? null;
    const excluded = version.geo_rules_json?.states?.exclude ?? null;

    // A state filter must respect both sides of the offer's geography.
    if (opts.state) {
      const wanted = opts.state.toUpperCase();
      if (states?.length && !states.includes(wanted)) continue;
      if (excluded?.length && excluded.includes(wanted)) continue;
    }

    const fields = fieldsBySchema.get(version.schema_version_id) ?? [];
    const rate = quotePublisherRate(version);
    const requirements = version.requirements_json ?? {};
    const returnPolicy = version.return_policy_json ?? {};

    results.push({
      offer_id: offer.id,
      offer_slug: offer.slug,
      offer_name: offer.name,
      offer_version: version.version,
      schema_version: schemaVersionNumber.get(version.schema_version_id) ?? null,
      vertical_code: offer.verticals?.code ?? null,
      vertical_name: offer.verticals?.name ?? null,
      lead_type: version.lead_type,
      pricing_mode: version.pricing_mode,
      publisher_rate_cents: rate.cents,
      rate_is_indicative: rate.indicative,
      states,
      excluded_states: excluded,
      consent_required: requirements.consent_required === true,
      verification:
        typeof requirements.verification === "string" ? requirements.verification : null,
      min_quality_score:
        typeof requirements.min_quality_score === "number"
          ? requirements.min_quality_score
          : null,
      max_lead_age_seconds: version.max_lead_age_seconds,
      return_window_hours:
        typeof returnPolicy.window_hours === "number" ? returnPolicy.window_hours : null,
      ping_fields: fieldsForPhase(fields, "ping").map(summarize),
      post_fields: fieldsForPhase(fields, "post").map(summarize),
      active_campaigns: active,
    });
  }

  return results.sort(
    (a, b) => (b.publisher_rate_cents ?? 0) - (a.publisher_rate_cents ?? 0),
  );
}

async function loadCampaignCounts(
  supabase: SupabaseClient,
): Promise<Array<{ offer_id: string; active_campaigns: number }>> {
  const { data, error } = await supabase.rpc("offer_active_campaign_counts");
  if (!error) {
    return (data ?? []) as Array<{ offer_id: string; active_campaigns: number }>;
  }

  // Some preview/prod databases can lag migrations or temporarily reject the
  // RPC grant. The demand page should still render empty-state UX instead of
  // crashing the whole publisher workspace.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return [];
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return [];
  }

  const { data: fallback, error: fallbackError } = await admin
    .from("campaigns")
    .select("offer_id")
    .eq("status", "active");

  if (fallbackError) {
    return [];
  }

  const counts = new Map<string, number>();
  for (const row of (fallback ?? []) as Array<{ offer_id: string | null }>) {
    if (!row.offer_id) continue;
    counts.set(row.offer_id, (counts.get(row.offer_id) ?? 0) + 1);
  }

  return [...counts.entries()].map(([offer_id, active_campaigns]) => ({
    offer_id,
    active_campaigns,
  }));
}
