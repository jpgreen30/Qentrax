import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return NextResponse.json({ ok: false, error: { code: "AUTH_REQUIRED" } }, { status: 401 });
  }

  const org = new URL(request.url).searchParams.get("org");
  let query = supabase
    .from("notifications")
    .select("id, organization_id, type, severity, title, body, href, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(40);
  if (org) query = query.eq("organization_id", org);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: { code: "QUERY_FAILED", message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data: { notifications: data ?? [] } });
}
