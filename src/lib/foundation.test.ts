import { describe, expect, it, vi } from "vitest";
import { assertOrganizationAccess } from "./organization-context";
import { isReasonCode, REASON_CODE_FAMILIES, REASON_CODES } from "./reason-codes";
import { requestId } from "./request-id";
import { recordAudit } from "./audit";

describe("foundation contracts", () => {
  it("preserves safe request IDs and replaces unsafe values", () => {
    expect(requestId("pub-request-1")).toBe("pub-request-1");
    expect(requestId("bad id\n")).toMatch(/^req_/);
  });

  it("rejects cross-tenant access by default", () => {
    expect(() =>
      assertOrganizationAccess(
        {
          userId: "u",
          organizationId: "org-a",
          role: "analyst",
          permissions: new Set(),
        },
        "org-b",
      ),
    ).toThrow("AUTH_FORBIDDEN");
  });

  it("allows explicit platform cross-organization reads", () => {
    expect(() =>
      assertOrganizationAccess(
        {
          userId: "u",
          organizationId: "platform",
          role: "admin",
          permissions: new Set(["platform:cross_organization:read"]),
        },
        "org-b",
      ),
    ).not.toThrow();
  });

  it("keeps reason codes stable", () => {
    expect(isReasonCode("CAMPAIGN_NOT_FUNDED")).toBe(true);
    expect(isReasonCode("NOT_A_CODE")).toBe(false);
    expect(REASON_CODES.CAMPAIGN_NOT_FUNDED).toContain("funds");
  });

  it("covers all Appendix A reason-code families", () => {
    expect(REASON_CODE_FAMILIES).toEqual(
      expect.arrayContaining([
        "SCHEMA",
        "IDENTITY",
        "CONSENT",
        "DUPLICATE",
        "VELOCITY",
        "GEO",
        "ELIGIBILITY",
        "CAMPAIGN",
        "DELIVERY",
        "RETURN",
        "PAYMENT",
        "PAYOUT",
        "CONVERSION",
        "AUTH",
      ]),
    );
  });

  it("appends an attributable audit event", async () => {
    const append = vi.fn();
    await recordAudit(
      { append },
      {
        actorUserId: "u",
        actorOrgId: "o",
        action: "organization.review",
        resourceType: "organization",
        resourceId: "o",
        reason: "fixture",
        requestId: "req_1",
      },
    );
    expect(append).toHaveBeenCalledOnce();
  });
});
