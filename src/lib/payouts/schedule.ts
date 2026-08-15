import type { SupabaseClient } from "@supabase/supabase-js";
import { requestId } from "@/lib/request-id";

export type PayoutCadence = "daily" | "weekly" | "biweekly" | "monthly";

export type PayoutScheduleConfig = {
  id: number;
  enabled: boolean;
  cadence: PayoutCadence;
  net_days: number;
  min_batch_cents: number;
  auto_approve: boolean;
  timezone: string;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_batch_id: string | null;
  last_run_message: string | null;
  next_run_at: string | null;
};

export type RunPayoutResult =
  | {
      ok: true;
      skipped?: false;
      batchId: string;
      itemCount: number;
      totalCents: number;
      status: string;
      message: string;
    }
  | {
      ok: true;
      skipped: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

/** Compute next run after `from` for the given cadence (UTC). */
export function computeNextRunAt(cadence: PayoutCadence, from: Date = new Date()): Date {
  const d = new Date(from.getTime());
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(0);
  d.setUTCHours(14); // 14:00 UTC default window

  if (cadence === "daily") {
    if (d <= from) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }

  if (cadence === "weekly" || cadence === "biweekly") {
    // Next Monday 14:00 UTC
    const day = d.getUTCDay(); // 0 Sun .. 6 Sat
    let add = (1 - day + 7) % 7;
    if (add === 0 && d <= from) add = 7;
    d.setUTCDate(d.getUTCDate() + add);
    if (cadence === "biweekly") {
      // Align to even ISO weeks from a fixed epoch Monday
      const epoch = Date.UTC(2024, 0, 1); // Monday-ish reference
      const weeks = Math.floor((d.getTime() - epoch) / (7 * 24 * 60 * 60 * 1000));
      if (weeks % 2 !== 0) d.setUTCDate(d.getUTCDate() + 7);
    }
    return d;
  }

  // monthly — 1st of next month 14:00 UTC
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  if (d <= from) d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

export async function loadScheduleConfig(
  supabase: SupabaseClient,
): Promise<PayoutScheduleConfig | null> {
  const { data } = await supabase
    .from("payout_schedule_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  return (data as PayoutScheduleConfig | null) ?? null;
}

/**
 * Create a payout batch from eligible billable publisher amounts.
 * Eligibility: not already batched, amount > 0, age >= netDays.
 */
export async function runScheduledPayout(
  supabase: SupabaseClient,
  opts: {
    netDays: number;
    minBatchCents: number;
    autoApprove: boolean;
    actorUserId?: string | null;
    notes?: string | null;
    source?: "cron" | "manual" | "admin";
  },
): Promise<RunPayoutResult> {
  const rid = requestId();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - opts.netDays);
  const cutoffIso = cutoff.toISOString();

  const { data: existingItems } = await supabase.from("payout_items").select("transaction_id");
  const used = new Set((existingItems ?? []).map((i) => i.transaction_id as string));

  const { data: txns, error: txnErr } = await supabase
    .from("transactions")
    .select("id, publisher_org_id, publisher_amount_cents, status, created_at")
    .eq("status", "billable")
    .lte("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(1000);

  if (txnErr) {
    return { ok: false, message: txnErr.message };
  }

  const eligible = (txns ?? []).filter(
    (t) =>
      t.publisher_org_id &&
      (t.publisher_amount_cents ?? 0) > 0 &&
      !used.has(t.id),
  );

  if (!eligible.length) {
    return {
      ok: true,
      skipped: true,
      message: `No eligible payables (Net-${opts.netDays}, unbatched billable).`,
    };
  }

  const total = eligible.reduce((s, t) => s + (t.publisher_amount_cents ?? 0), 0);
  if (total < opts.minBatchCents) {
    return {
      ok: true,
      skipped: true,
      message: `Eligible total ${total}¢ below minimum ${opts.minBatchCents}¢.`,
    };
  }

  const periodStart = eligible[0].created_at as string;
  const periodEnd = eligible[eligible.length - 1].created_at as string;
  const status = opts.autoApprove ? "approved" : "pending_approval";
  const source = opts.source ?? "cron";
  const notes =
    opts.notes ??
    `Auto ${source} · Net-${opts.netDays} · ${eligible.length} items`;

  const insertRow: Record<string, unknown> = {
    period_start: periodStart,
    period_end: periodEnd,
    status,
    total_cents: total,
    item_count: eligible.length,
    notes,
    created_by: opts.actorUserId ?? null,
  };
  if (opts.autoApprove && opts.actorUserId) {
    insertRow.approved_by = opts.actorUserId;
    insertRow.approved_at = new Date().toISOString();
  }

  const { data: batch, error: batchErr } = await supabase
    .from("payout_batches")
    .insert(insertRow)
    .select("id")
    .single();

  if (batchErr || !batch) {
    return { ok: false, message: batchErr?.message ?? "Batch insert failed" };
  }

  const rows = eligible.map((t) => ({
    batch_id: batch.id,
    publisher_org_id: t.publisher_org_id as string,
    transaction_id: t.id,
    amount_cents: t.publisher_amount_cents as number,
    status: "included",
  }));

  const { error: itemsErr } = await supabase.from("payout_items").insert(rows);
  if (itemsErr) {
    await supabase.from("payout_batches").update({ status: "failed" }).eq("id", batch.id);
    return { ok: false, message: itemsErr.message };
  }

  await supabase.from("audit_events").insert({
    actor_user_id: opts.actorUserId ?? null,
    actor_org_id: null,
    action: opts.autoApprove ? "payout_batch.auto_created_approved" : "payout_batch.auto_created",
    resource_type: "payout_batch",
    resource_id: batch.id,
    reason: source,
    after_redacted: {
      total_cents: total,
      item_count: eligible.length,
      status,
      net_days: opts.netDays,
      source,
    },
    request_id: rid,
  });

  return {
    ok: true,
    batchId: batch.id,
    itemCount: eligible.length,
    totalCents: total,
    status,
    message: `Batch ${batch.id.slice(0, 8)} · ${eligible.length} items · ${total}¢ · ${status}`,
  };
}

export async function recordScheduleRun(
  supabase: SupabaseClient,
  result: RunPayoutResult,
  cadence: PayoutCadence,
) {
  const now = new Date();
  const next = computeNextRunAt(cadence, now);
  const patch: Record<string, unknown> = {
    last_run_at: now.toISOString(),
    next_run_at: next.toISOString(),
    updated_at: now.toISOString(),
  };

  if (result.ok && !("skipped" in result && result.skipped)) {
    patch.last_run_status = "created";
    patch.last_run_batch_id = result.batchId;
    patch.last_run_message = result.message;
  } else if (result.ok && result.skipped) {
    patch.last_run_status = "skipped";
    patch.last_run_batch_id = null;
    patch.last_run_message = result.message;
  } else {
    patch.last_run_status = "error";
    patch.last_run_message = result.message;
  }

  await supabase.from("payout_schedule_config").update(patch).eq("id", 1);
}
