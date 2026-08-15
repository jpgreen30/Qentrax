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
    .select("id, name, status, base_bid_cents, daily_budget_cents, vertical_id, product_id, created_at")
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
    product_id?: string;
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
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      advertiser_org_id: body.organization_id,
      name: body.name.trim(),
      base_bid_cents: body.base_bid_cents ?? 0,
      daily_budget_cents: body.daily_budget_cents ?? null,
      vertical_id: body.vertical_id ?? null,
      product_id: body.product_id ?? null,
      status: "draft",
    })
    .select("id, name, status, base_bid_cents")
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
