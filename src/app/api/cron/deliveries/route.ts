import { NextResponse } from "next/server";
import { processDueDeliveries } from "@/lib/delivery/retry";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const header = request.headers.get("x-cron-secret") ?? "";
  return bearer === secret || header === secret;
}

async function handle(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Admin client unavailable" },
      { status: 500 },
    );
  }

  const limitParam = new URL(request.url).searchParams.get("limit");
  const limit = limitParam ? Math.min(100, Math.max(1, Number(limitParam) || 20)) : 20;

  const result = await processDueDeliveries(supabase, { limit });

  return NextResponse.json({
    ok: true,
    worker: "deliveries",
    ...result,
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
