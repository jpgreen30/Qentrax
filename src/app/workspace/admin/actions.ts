"use server";

import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth-context";
import {
  computeNextRunAt,
  recordScheduleRun,
  runScheduledPayout,
  type PayoutCadence,
} from "@/lib/payouts/schedule";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";

async function requireAdminActor() {
  const auth = await requireAuthContext();
  if (!auth) redirect("/sign-in");
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/workspace");
  return { auth, supabase, rid: requestId() };
}

export async function approveOrganization(formData: FormData) {
  const { auth, supabase, rid } = await requireAdminActor();
  const organizationId = String(formData.get("organization_id") ?? "");
  if (!organizationId) redirect("/workspace/admin");

  await supabase
    .from("organizations")
    .update({
      onboarding_status: "approved",
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId);

  await supabase
    .from("organization_profiles")
    .update({
      kyb_status: "approved",
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);

  await supabase.from("audit_events").insert({
    actor_user_id: auth.userId,
    actor_org_id: organizationId,
    action: "organization.approved",
    resource_type: "organization",
    resource_id: organizationId,
    reason: "admin_queue",
    request_id: rid,
  });

  redirect("/workspace/admin");
}

export async function rejectOrganization(formData: FormData) {
  const { auth, supabase, rid } = await requireAdminActor();
  const organizationId = String(formData.get("organization_id") ?? "");
  if (!organizationId) redirect("/workspace/admin");

  await supabase
    .from("organizations")
    .update({
      onboarding_status: "rejected",
      updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId);

  await supabase.from("audit_events").insert({
    actor_user_id: auth.userId,
    actor_org_id: organizationId,
    action: "organization.rejected",
    resource_type: "organization",
    resource_id: organizationId,
    reason: "admin_queue",
    request_id: rid,
  });

  redirect("/workspace/admin");
}

export async function suspendOrganization(formData: FormData) {
  const { auth, supabase, rid } = await requireAdminActor();
  const organizationId = String(formData.get("organization_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!organizationId) redirect("/workspace/admin/organizations");
  if (!reason || reason.length < 3) {
    redirect(`/workspace/admin/organizations?error=${encodeURIComponent("Reason required (min 3 chars)")}`);
  }

  const { data: before } = await supabase
    .from("organizations")
    .select("id, status, legal_name")
    .eq("id", organizationId)
    .maybeSingle();

  await supabase
    .from("organizations")
    .update({ status: "suspended", updated_at: new Date().toISOString() })
    .eq("id", organizationId);

  await supabase.from("audit_events").insert({
    actor_user_id: auth.userId,
    actor_org_id: organizationId,
    action: "organization.suspended",
    resource_type: "organization",
    resource_id: organizationId,
    reason,
    before_redacted: before ? { status: before.status } : null,
    after_redacted: { status: "suspended" },
    request_id: rid,
  });

  redirect("/workspace/admin/organizations?ok=suspended");
}

export async function reinstateOrganization(formData: FormData) {
  const { auth, supabase, rid } = await requireAdminActor();
  const organizationId = String(formData.get("organization_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "reinstated_by_admin";
  if (!organizationId) redirect("/workspace/admin/organizations");

  const { data: before } = await supabase
    .from("organizations")
    .select("id, status, legal_name")
    .eq("id", organizationId)
    .maybeSingle();

  await supabase
    .from("organizations")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", organizationId);

  await supabase.from("audit_events").insert({
    actor_user_id: auth.userId,
    actor_org_id: organizationId,
    action: "organization.reinstated",
    resource_type: "organization",
    resource_id: organizationId,
    reason,
    before_redacted: before ? { status: before.status } : null,
    after_redacted: { status: "active" },
    request_id: rid,
  });

  redirect("/workspace/admin/organizations?ok=reinstated");
}

/** Draft a payout batch from billable publisher amounts not already in a batch. */
export async function createPayoutBatch(formData: FormData) {
  const { auth, supabase, rid } = await requireAdminActor();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const { data: existingItems } = await supabase.from("payout_items").select("transaction_id");
  const used = new Set((existingItems ?? []).map((i) => i.transaction_id));

  const { data: txns } = await supabase
    .from("transactions")
    .select("id, publisher_org_id, publisher_amount_cents, status, created_at")
    .eq("status", "billable")
    .order("created_at", { ascending: true })
    .limit(500);

  const eligible = (txns ?? []).filter(
    (t) =>
      t.publisher_org_id &&
      (t.publisher_amount_cents ?? 0) > 0 &&
      !used.has(t.id),
  );

  if (!eligible.length) {
    redirect(`/workspace/admin/finance?error=${encodeURIComponent("No eligible payables to batch")}`);
  }

  const total = eligible.reduce((s, t) => s + (t.publisher_amount_cents ?? 0), 0);
  const periodStart = eligible[0].created_at;
  const periodEnd = eligible[eligible.length - 1].created_at;

  const { data: batch, error: batchErr } = await supabase
    .from("payout_batches")
    .insert({
      period_start: periodStart,
      period_end: periodEnd,
      status: "pending_approval",
      total_cents: total,
      item_count: eligible.length,
      notes,
      created_by: auth.userId,
    })
    .select("id")
    .single();

  if (batchErr || !batch) {
    redirect(
      `/workspace/admin/finance?error=${encodeURIComponent(batchErr?.message ?? "Batch create failed")}`,
    );
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
    redirect(`/workspace/admin/finance?error=${encodeURIComponent(itemsErr.message)}`);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: auth.userId,
    actor_org_id: null,
    action: "payout_batch.created",
    resource_type: "payout_batch",
    resource_id: batch.id,
    reason: notes ?? "admin_finance",
    after_redacted: { total_cents: total, item_count: eligible.length, status: "pending_approval" },
    request_id: rid,
  });

  redirect(`/workspace/admin/finance?ok=batch_created&batch=${batch.id}`);
}

export async function approvePayoutBatch(formData: FormData) {
  const { auth, supabase, rid } = await requireAdminActor();
  const batchId = String(formData.get("batch_id") ?? "");
  if (!batchId) redirect("/workspace/admin/finance");

  const { data: batch } = await supabase
    .from("payout_batches")
    .select("id, status, total_cents, item_count")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch || batch.status !== "pending_approval") {
    redirect(`/workspace/admin/finance?error=${encodeURIComponent("Batch not pending approval")}`);
  }

  await supabase
    .from("payout_batches")
    .update({
      status: "approved",
      approved_by: auth.userId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  await supabase.from("audit_events").insert({
    actor_user_id: auth.userId,
    actor_org_id: null,
    action: "payout_batch.approved",
    resource_type: "payout_batch",
    resource_id: batchId,
    reason: "admin_finance",
    before_redacted: { status: batch.status },
    after_redacted: { status: "approved", total_cents: batch.total_cents },
    request_id: rid,
  });

  redirect(`/workspace/admin/finance?ok=approved&batch=${batchId}`);
}

export async function releasePayoutBatch(formData: FormData) {
  const { auth, supabase, rid } = await requireAdminActor();
  const batchId = String(formData.get("batch_id") ?? "");
  if (!batchId) redirect("/workspace/admin/finance");

  const { data: batch } = await supabase
    .from("payout_batches")
    .select("id, status, total_cents")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch || batch.status !== "approved") {
    redirect(`/workspace/admin/finance?error=${encodeURIComponent("Batch must be approved before release")}`);
  }

  await supabase
    .from("payout_batches")
    .update({
      status: "released",
      released_by: auth.userId,
      released_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  await supabase.from("payout_items").update({ status: "paid" }).eq("batch_id", batchId);

  await supabase.from("audit_events").insert({
    actor_user_id: auth.userId,
    actor_org_id: null,
    action: "payout_batch.released",
    resource_type: "payout_batch",
    resource_id: batchId,
    reason: "admin_finance",
    before_redacted: { status: "approved" },
    after_redacted: { status: "released", total_cents: batch.total_cents },
    request_id: rid,
  });

  redirect(`/workspace/admin/finance?ok=released&batch=${batchId}`);
}

export async function cancelPayoutBatch(formData: FormData) {
  const { auth, supabase, rid } = await requireAdminActor();
  const batchId = String(formData.get("batch_id") ?? "");
  if (!batchId) redirect("/workspace/admin/finance");

  const { data: batch } = await supabase
    .from("payout_batches")
    .select("id, status")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch || !["draft", "pending_approval", "approved"].includes(batch.status)) {
    redirect(`/workspace/admin/finance?error=${encodeURIComponent("Cannot cancel this batch")}`);
  }

  await supabase
    .from("payout_batches")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", batchId);

  await supabase.from("payout_items").delete().eq("batch_id", batchId);

  await supabase.from("audit_events").insert({
    actor_user_id: auth.userId,
    actor_org_id: null,
    action: "payout_batch.cancelled",
    resource_type: "payout_batch",
    resource_id: batchId,
    reason: "admin_finance",
    before_redacted: { status: batch.status },
    after_redacted: { status: "cancelled" },
    request_id: rid,
  });

  redirect(`/workspace/admin/finance?ok=cancelled&batch=${batchId}`);
}

const CADENCES = new Set(["daily", "weekly", "biweekly", "monthly"]);

export async function savePayoutSchedule(formData: FormData) {
  const { auth, supabase, rid } = await requireAdminActor();

  const enabled = formData.get("enabled") === "on" || formData.get("enabled") === "true";
  const cadenceRaw = String(formData.get("cadence") ?? "weekly");
  const cadence = (CADENCES.has(cadenceRaw) ? cadenceRaw : "weekly") as PayoutCadence;
  const netDays = Math.min(365, Math.max(0, Number(formData.get("net_days") ?? 30) || 30));
  const minBatchCents = Math.max(0, Math.round(Number(formData.get("min_batch_cents") ?? 0) || 0));
  const autoApprove =
    formData.get("auto_approve") === "on" || formData.get("auto_approve") === "true";

  const next = computeNextRunAt(cadence);

  const { error } = await supabase.from("payout_schedule_config").upsert({
    id: 1,
    enabled,
    cadence,
    net_days: netDays,
    min_batch_cents: minBatchCents,
    auto_approve: autoApprove,
    next_run_at: next.toISOString(),
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    redirect(`/workspace/admin/finance?error=${encodeURIComponent(error.message)}`);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: auth.userId,
    actor_org_id: null,
    action: "payout_schedule.updated",
    resource_type: "payout_schedule_config",
    resource_id: null,
    reason: "admin_finance",
    after_redacted: {
      enabled,
      cadence,
      net_days: netDays,
      min_batch_cents: minBatchCents,
      auto_approve: autoApprove,
      next_run_at: next.toISOString(),
    },
    request_id: rid,
  });

  redirect("/workspace/admin/finance?ok=schedule_saved");
}

/** Force-run the scheduled payout job using current config (ignores enabled/next_run). */
export async function runPayoutScheduleNow(_formData: FormData) {
  const { auth, supabase } = await requireAdminActor();

  const { data: config } = await supabase
    .from("payout_schedule_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (!config) {
    redirect(
      `/workspace/admin/finance?error=${encodeURIComponent("Schedule config missing — apply payout_schedule migration")}`,
    );
  }

  const result = await runScheduledPayout(supabase, {
    netDays: config.net_days ?? 30,
    minBatchCents: Number(config.min_batch_cents) || 0,
    autoApprove: !!config.auto_approve,
    actorUserId: auth.userId,
    source: "manual",
  });

  await recordScheduleRun(supabase, result, (config.cadence as PayoutCadence) || "weekly");

  if (!result.ok) {
    redirect(`/workspace/admin/finance?error=${encodeURIComponent(result.message)}`);
  }
  if (result.skipped) {
    redirect(`/workspace/admin/finance?ok=schedule_skipped&msg=${encodeURIComponent(result.message)}`);
  }
  redirect(
    `/workspace/admin/finance?ok=schedule_ran&batch=${result.batchId}&msg=${encodeURIComponent(result.message)}`,
  );
}
