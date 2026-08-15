import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const auth = await requireAuthContext();
  if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  const orgId = new URL(request.url).searchParams.get("organization_id");
  if (!orgId) return apiError("VALIDATION_ERROR", "organization_id is required.", id, 400);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("publisher_sources")
    .select("id, name, channel, domain, status, quality_score, created_at")
    .eq("publisher_org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) return apiError("INTERNAL_ERROR", error.message, id, 500);
  return apiOk({ sources: data ?? [] }, id);
}

export async function POST(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const auth = await requireAuthContext();
  if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  let body: {
    organization_id?: string;
    name?: string;
    channel?: string;
    domain?: string;
    acquisition_method?: string;
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
  const { data: source, error } = await supabase
    .from("publisher_sources")
    .insert({
      publisher_org_id: body.organization_id,
      name: body.name.trim(),
      channel: body.channel ?? "web",
      domain: body.domain ?? null,
      acquisition_method: body.acquisition_method ?? null,
      status: "draft",
    })
    .select("id, name, status, channel")
    .single();

  if (error || !source) {
    return apiError("INTERNAL_ERROR", error?.message ?? "Failed to create source.", id, 500);
  }

  return apiOk({ source }, id, 201);
}
