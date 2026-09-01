import { describe, expect, it, vi } from "vitest";
import { emitNotification, formatCents } from "./notifications";

describe("emitNotification", () => {
  it("calls emit_notification rpc with org isolation fields", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await emitNotification({ rpc } as never, {
      organizationId: "org-1",
      type: "organization.approved",
      title: "Organization approved",
      dedupeKey: "org-approved-org-1",
    });
    expect(rpc).toHaveBeenCalledWith(
      "emit_notification",
      expect.objectContaining({
        p_organization_id: "org-1",
        p_type: "organization.approved",
        p_dedupe_key: "org-approved-org-1",
      }),
    );
  });

  it("covers remaining lifecycle event types with stable dedupe keys", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const events = [
      ["campaign.activated", "campaign-activated:c1"],
      ["lead.accepted", "lead-post:t1"],
      ["campaign.budget.daily", "campaign.budget.daily:c1:2026-09-01"],
      ["campaign.budget.monthly", "campaign.budget.monthly:c1:2026-09"],
      ["campaign.cap.daily", "campaign.cap.daily:c1:2026-09-01"],
      ["campaign.cap.hourly", "campaign.cap.hourly:c1:2026-09-01T04"],
      ["webhook.delivery.failed", "webhook-failed:t1:1"],
      ["billing.funded", "billing-funded:cs:sess"],
      ["payout.released", "payout-released:b1:org-1"],
      ["compliance.organization.suspended", "org-suspended:org-1"],
    ] as const;
    for (const [type, dedupeKey] of events) {
      await emitNotification({ rpc } as never, {
        organizationId: "org-1",
        type,
        title: type,
        dedupeKey,
      });
    }
    expect(rpc).toHaveBeenCalledTimes(events.length);
    expect(rpc.mock.calls.map((c) => c[1].p_type)).toEqual(events.map(([t]) => t));
  });

  it("formats cents for notification copy", () => {
    expect(formatCents(50000)).toBe("$500.00");
    expect(formatCents(null)).toBe("$0.00");
  });
});
