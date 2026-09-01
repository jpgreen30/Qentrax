import { describe, expect, it, vi } from "vitest";
import { emitNotification } from "./notifications";

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
});
