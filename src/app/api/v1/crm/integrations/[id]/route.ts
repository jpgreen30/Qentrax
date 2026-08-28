import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  const { data, error } = await supabase
    .from("crm_integrations")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error) {
    return Response.json(
      { success: false, message: "CRM integration not found" },
      { status: 404 }
    );
  }

  return Response.json({ success: true, data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  const allowedFields = [
    "name",
    "status",
    "credentials",
    "mapped_fields",
    "sync_enabled",
    "sync_frequency_minutes",
  ];

  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("crm_integrations")
    .update(updates)
    .eq("id", params.id);

  if (error) {
    return Response.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }

  return Response.json({ success: true, message: "Integration updated" });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  const { error } = await supabase
    .from("crm_integrations")
    .delete()
    .eq("id", params.id);

  if (error) {
    return Response.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }

  return Response.json({ success: true, message: "Integration deleted" });
}
