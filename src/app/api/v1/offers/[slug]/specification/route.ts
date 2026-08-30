import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";
import { buildJsonSchema } from "@/lib/offers/json-schema";
import { buildExamplePayload } from "@/lib/offers/examples";
import { buildFieldDictionaryCsv } from "@/lib/offers/field-dictionary";
import type { VerticalField } from "@/lib/offers/types";

/**
 * GET /api/v1/offers/{slug}/specification — the complete Lead Specification an
 * advertiser reads before purchase and a publisher integrates against.
 *
 * Everything is derived from the published vertical schema version the offer
 * version froze at publish time, so the contract shown is exactly the one the
 * router validates against.
 *
 * ?format=json_schema&phase=ping|post  → the JSON Schema alone
 * ?format=csv                          → the field dictionary as a download
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const id = requestId(request.headers.get("x-request-id"));
  const auth = await requireAuthContext();
  if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  const { slug } = await context.params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "full";
  const phaseParam = url.searchParams.get("phase");
  const phase = phaseParam === "ping" ? "ping" : "post";

  const supabase = await createClient();

  const { data: offer, error } = await supabase
    .from("offers")
    .select(
      `id, name, slug, description, status, vertical_id, current_version_id,
       verticals ( code, name ),
       offer_versions!offers_current_version_id_fkey (
         id, version, lead_type, pricing_mode, price_cents, floor_cents,
         ceiling_cents, geo_rules_json, requirements_json, return_policy_json,
         max_lead_age_seconds, schema_version_id, published_at
       )`,
    )
    .eq("slug", slug)
    .maybeSingle();

  // RLS hides unpublished offers, so a miss is either unknown or not visible.
  if (error || !offer) {
    return apiError("NOT_FOUND", "Offer not found.", id, 404);
  }

  const version = offer.offer_versions as unknown as {
    id: string; version: number; schema_version_id: string;
    lead_type: string; pricing_mode: string;
  } | null;

  if (!version) {
    return apiError("NOT_FOUND", "Offer has no published version.", id, 404);
  }

  const { data: schemaVersion } = await supabase
    .from("vertical_schema_versions")
    .select("id, version, status, published_at")
    .eq("id", version.schema_version_id)
    .maybeSingle();

  const { data: fieldRows } = await supabase
    .from("vertical_fields")
    .select(
      `field_key, label, description, field_type, required, phase, is_pii,
       consent_classification, enum_values, validation_json, default_value,
       aliases, sort_order`,
    )
    .eq("schema_version_id", version.schema_version_id)
    .order("sort_order");

  const fields = (fieldRows ?? []) as unknown as VerticalField[];

  const meta = {
    offerSlug: offer.slug,
    offerVersion: version.version,
    schemaVersion: schemaVersion?.version ?? 0,
  };

  if (format === "json_schema") {
    return apiOk({ schema: buildJsonSchema(fields, phase, meta) }, id);
  }

  if (format === "csv") {
    return new Response(buildFieldDictionaryCsv(fields), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${offer.slug}-v${version.version}-fields.csv"`,
        "Cache-Control": "no-store",
        "X-Request-Id": id,
      },
    });
  }

  return apiOk(
    {
      offer: {
        id: offer.id,
        name: offer.name,
        slug: offer.slug,
        description: offer.description,
        vertical: offer.verticals,
      },
      version,
      schema_version: schemaVersion,
      fields,
      json_schema: {
        ping: buildJsonSchema(fields, "ping", meta),
        post: buildJsonSchema(fields, "post", meta),
      },
      examples: {
        ping: buildExamplePayload(fields, "ping"),
        post: buildExamplePayload(fields, "post"),
      },
      downloads: {
        field_dictionary_csv: `/api/v1/offers/${offer.slug}/specification?format=csv`,
        ping_schema: `/api/v1/offers/${offer.slug}/specification?format=json_schema&phase=ping`,
        post_schema: `/api/v1/offers/${offer.slug}/specification?format=json_schema&phase=post`,
      },
    },
    id,
  );
}
