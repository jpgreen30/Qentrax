import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeNextRunAt,
  loadScheduleConfig,
  recordScheduleRun,
  runScheduledPayout,
  type PayoutCadence,
} from "@/lib/payouts/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const header = request.headers.get("x-cron-secret") ?? "";
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET> when configured
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

  const config = await loadScheduleConfig(supabase);
  if (!config) {
    return NextResponse.json(
      { error: "payout_schedule_config missing — apply migration" },
      { status: 500 },
    );
  }

  const force = new URL(request.url).searchParams.get("force") === "1";

  if (!config.enabled && !force) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      message: "Schedule disabled",
      next_run_at: config.next_run_at,
    });
  }

  // Optional: skip if next_run_at is still in the future (unless force)
  if (!force && config.next_run_at) {
    const next = new Date(config.next_run_at).getTime();
    if (next > Date.now() + 60_000) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        message: "Not due yet",
        next_run_at: config.next_run_at,
      });
    }
  }

  const result = await runScheduledPayout(supabase, {
    netDays: config.net_days,
    minBatchCents: Number(config.min_batch_cents) || 0,
    autoApprove: config.auto_approve,
    actorUserId: null,
    source: "cron",
  });

  await recordScheduleRun(supabase, result, config.cadence as PayoutCadence);

  const nextRun = computeNextRunAt(config.cadence as PayoutCadence);

  return NextResponse.json({
    ...result,
    next_run_at: nextRun.toISOString(),
    config: {
      cadence: config.cadence,
      net_days: config.net_days,
      min_batch_cents: config.min_batch_cents,
      auto_approve: config.auto_approve,
    },
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
