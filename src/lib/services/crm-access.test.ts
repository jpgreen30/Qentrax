import { describe, expect, it } from "vitest";
import { requireAdvertiserCrmAccess } from "./crm-access";

function mockSupabase(match: {
  organization?: null | { id: string; legal_name: string; onboarding_status: string; type: string; status: string };
}) {
  return {
    from(table: string) {
      expect(table).toBe("organizations");
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({
        data: match.organization ?? null,
        error: null,
      });
      return chain;
    },
  };
}

describe("requireAdvertiserCrmAccess", () => {
  it("rejects missing authentication before any organization lookup", async () => {
    const supabase = mockSupabase({ organization: null });
    const result = await requireAdvertiserCrmAccess("org-1", {
      auth: null,
      supabase: supabase as never,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("AUTH_REQUIRED");
  });

  it("rejects missing organization_id", async () => {
    const supabase = mockSupabase({ organization: null });
    const result = await requireAdvertiserCrmAccess(null, {
      auth: {
        authSubject: "sub-1",
        email: "buyer@example.com",
        userId: "user-1",
      },
      supabase: supabase as never,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VALIDATION_ERROR");
  });

  it("rejects non-accessible organizations", async () => {
    const supabase = mockSupabase({ organization: null });
    const result = await requireAdvertiserCrmAccess("org-1", {
      auth: {
        authSubject: "sub-1",
        email: "buyer@example.com",
        userId: "user-1",
      },
      supabase: supabase as never,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("AUTH_FORBIDDEN");
  });

  it("returns the advertiser organization for an authenticated member", async () => {
    const organization = {
      id: "org-1",
      legal_name: "Atlas Growth",
      onboarding_status: "approved",
      type: "advertiser",
      status: "active",
    };
    const supabase = mockSupabase({ organization });
    const result = await requireAdvertiserCrmAccess("org-1", {
      auth: {
        authSubject: "sub-1",
        email: "buyer@example.com",
        userId: "user-1",
      },
      supabase: supabase as never,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.organization.id).toBe("org-1");
      expect(result.organization.type).toBe("advertiser");
    }
  });
});
