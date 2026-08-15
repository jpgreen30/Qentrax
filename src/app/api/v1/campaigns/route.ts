import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const auth = await requireAuthContext();
  if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  const url = new URL(request.url);
  const orgId = url.searchParams.get("organization_id");
  if (!orgId) return apiError("VALIDATION_ERROR", "organization_id is required.", id, 400);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select(
      "id, name, status, base_bid_cents, daily_budget_cents, vertical_id, product_id, targeting_json, created_at",
    )
    .eq("advertiser_org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) return apiError("INTERNAL_ERROR", error.message, id, 500);
  return apiOk({ campaigns: data ?? [] }, id);
}

export async function POST(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const auth = await requireAuthContext();
  if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  let body: {
    organization_id?: string;
    name?: string;
    base_bid_cents?: number;
    daily_budget_cents?: number;
    vertical_id?: string;
    vertical_code?: string;
    product_id?: string;
    product_code?: string;
    targeting?: { states?: string[] };
  };
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body.", id, 400);
  }

  if (!body.organization_id || !body.name?.trim()) {
    return apiError("VALIDATION_ERROR", "organization_id and name are required.", id, 400);
  }

  const supabase = await createClient();

  let verticalId = body.vertical_id ?? null;
  let productId = body.product_id ?? null;

  if (!verticalId && body.vertical_code) {
    const { data: v } = await supabase
      .from("verticals")
      .select("id")
      .eq("code", body.vertical_code)
      .maybeSingle();
    verticalId = v?.id ?? null;
  }
  if (verticalId && !productId && body.product_code) {
    const { data: p } = await supabase
      .from("products")
      .select("id")
      .eq("vertical_id", verticalId)
      .eq("code", body.product_code)
      .maybeSingle();
    productId = p?.id ?? null;
  }

  const targeting_json = body.targeting ?? {};

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      advertiser_org_id: body.organization_id,
      name: body.name.trim(),
      base_bid_cents: body.base_bid_cents ?? 0,
      daily_budget_cents: body.daily_budget_cents ?? null,
      vertical_id: verticalId,
      product_id: productId,
      targeting_json,
      status: "draft",
    })
    .select("id, name, status, base_bid_cents, vertical_id, targeting_json")
    .single();

  if (error || !campaign) {
    return apiError("INTERNAL_ERROR", error?.message ?? "Failed to create campaign.", id, 500);
  }

  await supabase.from("campaign_versions").insert({
    campaign_id: campaign.id,
    version: 1,
    created_by: auth.userId,
  });

  return apiOk({ campaign }, id, 201);
}
