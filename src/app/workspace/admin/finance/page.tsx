import Link from "next/link";
import WorkspaceShell from "@/components/WorkspaceShell";
import { money, requireAdmin } from "@/lib/workspace-data";
import {
  approvePayoutBatch,
  cancelPayoutBatch,
  createPayoutBatch,
  releasePayoutBatch,
  runPayoutScheduleNow,
  savePayoutSchedule,
} from "../actions";

export default async function AdminFinance({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; batch?: string; msg?: string }>;
}) {
  const params = await searchParams;
  const { supabase } = await requireAdmin();

  const [{ data: txns }, { data: batches }, { data: items }, { data: orgs }, { data: schedule }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select(
          "id, publisher_org_id, publisher_amount_cents, advertiser_price_cents, status, created_at",
        )
        .eq("status", "billable")
        .order("created_at", { ascending: false })
        .limit(400),
      supabase
        .from("payout_batches")
        .select(
          "id, status, total_cents, item_count, period_start, period_end, notes, approved_at, released_at, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("payout_items")
        .select("transaction_id, batch_id, publisher_org_id, amount_cents, status"),
      supabase
        .from("organizations")
        .select("id, legal_name, type")
        .eq("type", "publisher")
        .limit(200),
      supabase.from("payout_schedule_config").select("*").eq("id", 1).maybeSingle(),
    ]);

  const usedTxn = new Set((items ?? []).map((i) => i.transaction_id));
  const eligible = (txns ?? []).filter(
    (t) => t.publisher_org_id && (t.publisher_amount_cents ?? 0) > 0 && !usedTxn.has(t.id),
  );
  const eligibleCents = eligible.reduce((s, t) => s + (t.publisher_amount_cents ?? 0), 0);
  const gmv = (txns ?? []).reduce((s, t) => s + (t.advertiser_price_cents ?? 0), 0);
  const payableAll = (txns ?? []).reduce((s, t) => s + (t.publisher_amount_cents ?? 0), 0);
  const margin = gmv - payableAll;

  const netDays = schedule?.net_days ?? 30;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - netDays);
  const scheduledEligible = eligible.filter((t) => new Date(t.created_at) <= cutoff);
  const scheduledCents = scheduledEligible.reduce(
    (s, t) => s + (t.publisher_amount_cents ?? 0),
    0,
  );

  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.legal_name]));
  const byPub = new Map<string, { name: string; cents: number; n: number }>();
  for (const t of eligible) {
    const id = t.publisher_org_id as string;
    const row = byPub.get(id) ?? {
      name: orgName.get(id) ?? id.slice(0, 8),
      cents: 0,
      n: 0,
    };
    row.cents += t.publisher_amount_cents ?? 0;
    row.n += 1;
    byPub.set(id, row);
  }

  const notice =
    params.error
      ? params.error
      : params.ok === "batch_created"
        ? `Payout batch created${params.batch ? ` · ${params.batch.slice(0, 8)}` : ""}`
        : params.ok === "approved"
          ? "Batch approved — ready to release."
          : params.ok === "released"
            ? "Batch released · items marked paid."
            : params.ok === "cancelled"
              ? "Batch cancelled · payables returned to pool."
              : params.ok === "schedule_saved"
                ? "Payout schedule saved."
                : params.ok === "schedule_ran"
                  ? params.msg ?? "Scheduled run completed."
                  : params.ok === "schedule_skipped"
                    ? params.msg ?? "Scheduled run skipped (nothing eligible)."
                    : null;

  return (
    <WorkspaceShell
      role="admin"
      orgName="Qentrax Platform"
      orgStatus="admin"
      initials="QX"
      active="finance"
      eyebrow="PLATFORM FINANCE"
      title="Finance & payouts"
      subtitle="Manual batches, automated Net-N scheduling, approve, then release."
    >
      {notice && (
        <p
          className="dashNotice"
          style={params.error ? { borderColor: "#5a2a2a", color: "#ff8a8a" } : undefined}
        >
          {notice}
        </p>
      )}

      <div className="dashStats">
        <article>
          <header>
            <span>ELIGIBLE PAYABLE</span>
            <i>$</i>
          </header>
          <strong>{money(eligibleCents)}</strong>
          <small>{eligible.length} UNBATCHED TXNS</small>
        </article>
        <article>
          <header>
            <span>NET-{netDays} READY</span>
            <i>◎</i>
          </header>
          <strong>{money(scheduledCents)}</strong>
          <small>{scheduledEligible.length} FOR SCHEDULE</small>
        </article>
        <article>
          <header>
            <span>PLATFORM MARGIN</span>
            <i>↗</i>
          </header>
          <strong>{money(margin)}</strong>
          <small>GMV {money(gmv)}</small>
        </article>
        <article>
          <header>
            <span>SCHEDULE</span>
            <i>⌁</i>
          </header>
          <strong>{schedule?.enabled ? "ON" : "OFF"}</strong>
          <small>
            {(schedule?.cadence ?? "weekly").toUpperCase()}
            {schedule?.next_run_at
              ? ` · NEXT ${new Date(schedule.next_run_at).toLocaleDateString()}`
              : ""}
          </small>
        </article>
      </div>

      <div className="dashGrid">
        <article className="dashPanel formPanel">
          <header>
            <span>AUTOMATION</span>
            <h2>Payout schedule</h2>
          </header>
          <p className="formLede">
            Cron runs daily at 14:00 UTC (`/api/cron/payouts`). When due, creates a batch from
            billable payables aged ≥ Net days. Release still requires approval unless auto-approve
            is on.
          </p>
          <form action={savePayoutSchedule} className="workspace-actions">
            <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={!!schedule?.enabled}
                style={{ width: 18, height: 18 }}
              />
              <span>Enable automated scheduling</span>
            </label>
            <label>
              Cadence
              <select name="cadence" defaultValue={schedule?.cadence ?? "weekly"}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly (Monday)</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly (1st)</option>
              </select>
            </label>
            <label>
              Net days (age before eligible)
              <input
                name="net_days"
                type="number"
                min={0}
                max={365}
                defaultValue={schedule?.net_days ?? 30}
              />
            </label>
            <label>
              Minimum batch (cents)
              <input
                name="min_batch_cents"
                type="number"
                min={0}
                defaultValue={schedule?.min_batch_cents ?? 0}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="checkbox"
                name="auto_approve"
                defaultChecked={!!schedule?.auto_approve}
                style={{ width: 18, height: 18 }}
              />
              <span>Auto-approve batches (skip manual Approve)</span>
            </label>
            <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <button className="dashAction" type="submit">
                SAVE SCHEDULE
              </button>
            </div>
          </form>
          <form action={runPayoutScheduleNow} style={{ padding: "0 20px 20px" }}>
            <button className="dashGhost" type="submit">
              RUN NOW (force)
            </button>
            {schedule?.last_run_at && (
              <p style={{ marginTop: 12, color: "#718287", fontSize: 12 }}>
                Last run: {new Date(schedule.last_run_at).toLocaleString()} ·{" "}
                {schedule.last_run_status ?? "—"}
                {schedule.last_run_message ? ` · ${schedule.last_run_message}` : ""}
              </p>
            )}
          </form>
        </article>

        <article className="dashPanel formPanel">
          <header>
            <span>CREATE</span>
            <h2>Manual payout batch</h2>
          </header>
          <p className="formLede">
            Pulls all unbatched billable publisher amounts (ignores Net days). Use schedule for
            production Net-30 policy.
          </p>
          <form action={createPayoutBatch} className="workspace-actions">
            <label>
              Notes (optional)
              <input name="notes" placeholder="Week of Aug 11 · test clearing" />
            </label>
            <button
              className="dashAction"
              type="submit"
              disabled={!eligible.length}
              style={{ marginTop: 12 }}
            >
              CREATE BATCH · {eligible.length} ITEMS · {money(eligibleCents)}
            </button>
          </form>

          <header style={{ marginTop: 8 }}>
            <span>BY PUBLISHER</span>
            <h2>Unbatched payables</h2>
          </header>
          <div className="tableHead bill">
            <span>PUBLISHER</span>
            <span>ITEMS</span>
            <span>AMOUNT</span>
          </div>
          {Array.from(byPub.entries()).map(([id, row]) => (
            <div className="tableRow bill" key={id}>
              <span>{row.name}</span>
              <span>{row.n}</span>
              <span className="status">{money(row.cents)}</span>
            </div>
          ))}
          {!byPub.size && (
            <div className="tableRow">
              <span className="status">No unbatched payables.</span>
            </div>
          )}
        </article>
      </div>

      <div className="dashPanel">
        <header>
          <span>BATCHES</span>
          <h2>Payout batch queue</h2>
        </header>
        <div className="tableHead finance">
          <span>BATCH</span>
          <span>STATUS</span>
          <span>ITEMS</span>
          <span>TOTAL</span>
          <span>PERIOD</span>
          <span>ACTIONS</span>
        </div>
        {(batches ?? []).map((b) => (
          <div className="tableRow finance" key={b.id}>
            <span>{b.id.slice(0, 8)}</span>
            <span className="status">{b.status.toUpperCase()}</span>
            <span>{b.item_count}</span>
            <span>{money(b.total_cents)}</span>
            <span>
              {new Date(b.period_start).toLocaleDateString()} –{" "}
              {new Date(b.period_end).toLocaleDateString()}
            </span>
            <span className="adminActions">
              {b.status === "pending_approval" && (
                <>
                  <form action={approvePayoutBatch}>
                    <input type="hidden" name="batch_id" value={b.id} />
                    <button className="dashAction" type="submit" style={{ height: 32, fontSize: 10 }}>
                      Approve
                    </button>
                  </form>
                  <form action={cancelPayoutBatch}>
                    <input type="hidden" name="batch_id" value={b.id} />
                    <button className="dashGhost" type="submit" style={{ height: 32, fontSize: 10 }}>
                      Cancel
                    </button>
                  </form>
                </>
              )}
              {b.status === "approved" && (
                <>
                  <form action={releasePayoutBatch}>
                    <input type="hidden" name="batch_id" value={b.id} />
                    <button className="dashAction" type="submit" style={{ height: 32, fontSize: 10 }}>
                      Release
                    </button>
                  </form>
                  <form action={cancelPayoutBatch}>
                    <input type="hidden" name="batch_id" value={b.id} />
                    <button className="dashGhost" type="submit" style={{ height: 32, fontSize: 10 }}>
                      Cancel
                    </button>
                  </form>
                </>
              )}
              {b.status === "released" && (
                <span style={{ color: "#6a7c80", fontSize: 11 }}>
                  {b.released_at ? new Date(b.released_at).toLocaleString() : "paid"}
                </span>
              )}
              {b.status === "cancelled" && <span style={{ color: "#6a7c80" }}>—</span>}
            </span>
          </div>
        ))}
        {!batches?.length && (
          <div className="tableRow">
            <span className="status">No batches yet.</span>
          </div>
        )}
      </div>

      <article className="dashPanel metricsNote">
        <span>FINANCE NOTES</span>
        <p>
          Automation: Vercel Cron → <code>/api/cron/payouts</code> with{" "}
          <code>Authorization: Bearer $CRON_SECRET</code>. Requires{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> + <code>CRON_SECRET</code> in Vercel env. See{" "}
          <Link href="/workspace/admin/audit" style={{ color: "var(--acid)" }}>
            Audit log
          </Link>
          .
        </p>
      </article>
    </WorkspaceShell>
  );
}
