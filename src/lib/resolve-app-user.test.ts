import { describe, it, expect, vi } from "vitest";
import {
  resolveAppUserFromAuthSubject,
  listActiveMembershipsForAuthSubject,
  assertNotAuthSubjectAsMemberUserId,
} from "./resolve-app-user";

const AUTH_UID = "66f7cd5d-71ff-4435-95e4-7d41bf048cfe";
const APP_USER_ID = "7bbd89d4-e22f-4518-8d40-896679bb654f";
const OTHER_AUTH = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OTHER_APP = "11111111-2222-3333-4444-555555555555";
const PUBLISHER_ORG = "44b9ed12-44e3-4ab4-a9ff-dda7b4a9b421";

type QueryResult = { data: unknown; error: unknown };

function mockSupabase(handlers: {
  users?: (authSubject: string) => QueryResult;
  members?: (userId: string) => QueryResult;
}) {
  return {
    from(table: string) {
      if (table === "users") {
        let subject = "";
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = (_col: string, val: string) => {
          subject = val;
          return chain;
        };
        chain.maybeSingle = async () =>
          handlers.users?.(subject) ?? { data: null, error: null };
        return chain;
      }
      if (table === "organization_members") {
        let userId = "";
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = (col: string, val: string) => {
          if (col === "user_id") userId = val;
          if (col === "status") {
            const result = async () =>
              handlers.members?.(userId) ?? { data: [], error: null };
            return {
              then(
                resolve: (v: QueryResult) => unknown,
                reject?: (e: unknown) => unknown,
              ) {
                return result().then(resolve, reject);
              },
            };
          }
          return chain;
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("resolveAppUserFromAuthSubject", () => {
  it("maps valid Auth UID → public.users.id", async () => {
    const supabase = mockSupabase({
      users: (s) =>
        s === AUTH_UID
          ? { data: { id: APP_USER_ID, status: "active" }, error: null }
          : { data: null, error: null },
    });
    const r = await resolveAppUserFromAuthSubject(supabase as never, AUTH_UID);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.appUserId).toBe(APP_USER_ID);
      expect(r.authSubject).toBe(AUTH_UID);
      expect(r.appUserId).not.toBe(r.authSubject);
    }
  });

  it("rejects unknown Auth UID", async () => {
    const supabase = mockSupabase({
      users: () => ({ data: null, error: null }),
    });
    const r = await resolveAppUserFromAuthSubject(supabase as never, OTHER_AUTH);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("USER_NOT_FOUND");
  });

  it("rejects inactive application user", async () => {
    const supabase = mockSupabase({
      users: () => ({
        data: { id: APP_USER_ID, status: "suspended" },
        error: null,
      }),
    });
    const r = await resolveAppUserFromAuthSubject(supabase as never, AUTH_UID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("USER_INACTIVE");
  });

  it("rejects empty subject", async () => {
    const supabase = mockSupabase({});
    const r = await resolveAppUserFromAuthSubject(supabase as never, "  ");
    expect(r.ok).toBe(false);
  });
});

describe("listActiveMembershipsForAuthSubject", () => {
  it("loads memberships by app user id, not Auth UID", async () => {
    let memberQueryUserId: string | null = null;
    const supabase = mockSupabase({
      users: (s) =>
        s === AUTH_UID
          ? { data: { id: APP_USER_ID, status: "active" }, error: null }
          : { data: null, error: null },
      members: (uid) => {
        memberQueryUserId = uid;
        if (uid === APP_USER_ID) {
          return {
            data: [
              {
                organization_id: PUBLISHER_ORG,
                status: "active",
                organizations: { type: "publisher" },
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      },
    });

    const r = await listActiveMembershipsForAuthSubject(
      supabase as never,
      AUTH_UID,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.appUserId).toBe(APP_USER_ID);
      expect(memberQueryUserId).toBe(APP_USER_ID);
      expect(memberQueryUserId).not.toBe(AUTH_UID);
      expect(r.memberships).toHaveLength(1);
      expect(r.memberships[0].organization_id).toBe(PUBLISHER_ORG);
    }
  });

  it("does not cross tenants: other auth subject sees no memberships of user A", async () => {
    const supabase = mockSupabase({
      users: (s) =>
        s === OTHER_AUTH
          ? { data: { id: OTHER_APP, status: "active" }, error: null }
          : s === AUTH_UID
            ? { data: { id: APP_USER_ID, status: "active" }, error: null }
            : { data: null, error: null },
      members: (uid) => {
        if (uid === APP_USER_ID) {
          return {
            data: [
              {
                organization_id: PUBLISHER_ORG,
                status: "active",
                organizations: { type: "publisher" },
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      },
    });

    const r = await listActiveMembershipsForAuthSubject(
      supabase as never,
      OTHER_AUTH,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.appUserId).toBe(OTHER_APP);
      expect(r.memberships).toHaveLength(0);
    }
  });

  it("rejects when app user missing before membership query", async () => {
    const members = vi.fn();
    const supabase = mockSupabase({
      users: () => ({ data: null, error: null }),
      members: () => {
        members();
        return { data: [], error: null };
      },
    });
    const r = await listActiveMembershipsForAuthSubject(
      supabase as never,
      OTHER_AUTH,
    );
    expect(r.ok).toBe(false);
    expect(members).not.toHaveBeenCalled();
  });
});

describe("auth subject must not be treated as membership user_id", () => {
  it("assertNotAuthSubjectAsMemberUserId flags equal ids as unsafe", () => {
    expect(assertNotAuthSubjectAsMemberUserId(AUTH_UID, APP_USER_ID)).toBe(true);
    expect(assertNotAuthSubjectAsMemberUserId(AUTH_UID, AUTH_UID)).toBe(false);
  });
});
