import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createSign } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { processDueDeliveries, computeBackoffMs } from "./retry";
import { replayDelivery } from "./replay";

/**
 * Delivery lifecycle against the real database and a real endpoint.
 *
 * Phase 8 requires retries to be genuinely scheduled and processed, not
 * implemented as unused code, and requires dead-lettering and replay that does
 * not double-bill. Asserting that with mocks would prove nothing, so this runs
 * against the local stack: real Postgres over the project's migrations, real
 * PostgREST enforcing the real policies, and an HTTP server whose behaviour the
 * test controls.
 *
 * Skipped unless the stack is up (scripts/e2e-up.sh), so `npm test` stays
 * self-contained.
 */
const KEY_PATH = path.join(process.cwd(), "e2e/harness/jwt-private.pem");
const STACK_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const STACK_UP = existsSync(KEY_PATH) && process.env.E2E_STACK === "1";

function serviceToken(): string {
  const b = (x: string) => Buffer.from(x).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: "qentrax-e2e" };
  const payload = {
    iss: `${STACK_URL}/auth/v1`,
    aud: "authenticated",
    role: "service_role",
    sub: "00000000-0000-0000-0000-0000000000ff",
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b(JSON.stringify(header))}.${b(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  return `${signingInput}.${signer.sign(readFileSync(KEY_PATH, "utf8"), "base64url")}`;
}

type Behavior = { kind: "accept" } | { kind: "fail"; code: number };

let server: http.Server;
let hookUrl: string;
let behavior: Behavior = { kind: "fail", code: 500 };
let hits = 0;
let supabase: SupabaseClient;
let previousLoopback: string | undefined;

// Fixture ids, distinct from the browser suite's.
const ADV = "d1000000-0000-0000-0000-0000000000a1";
const PUB = "d1000000-0000-0000-0000-0000000000b1";
const VERT = "d1000000-0000-0000-0000-0000000000c1";
const SRC = "d1000000-0000-0000-0000-0000000000d1";
const CAMP = "d1000000-0000-0000-0000-0000000000e1";

describe.skipIf(!STACK_UP)("delivery retry lifecycle (live stack)", () => {
  beforeAll(async () => {
    previousLoopback = process.env.QENTRAX_ALLOW_LOOPBACK_DELIVERY;
    process.env.QENTRAX_ALLOW_LOOPBACK_DELIVERY = "1";

    server = http.createServer((req, res) => {
      hits += 1;
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        if (behavior.kind === "accept") {
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ ok: true }));
        }
        res.writeHead(behavior.code, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "upstream unavailable" }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    hookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;

    const token = serviceToken();
    supabase = createClient(STACK_URL, "test-key", {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Clean slate, then fixtures.
    await supabase.from("deliveries").delete().eq("campaign_id", CAMP);
    await supabase.from("campaigns").delete().eq("id", CAMP);
    await supabase.from("organizations").upsert([
      { id: ADV, type: "advertiser", legal_name: "Retry Advertiser" },
      { id: PUB, type: "publisher", legal_name: "Retry Publisher" },
    ]);
    await supabase.from("verticals").upsert([{ id: VERT, code: "retryv", name: "Retry" }]);
    await supabase
      .from("publisher_sources")
      .upsert([{ id: SRC, publisher_org_id: PUB, name: "Retry Source" }]);
    await supabase.from("campaigns").upsert([
      {
        id: CAMP,
        advertiser_org_id: ADV,
        name: "Retry Campaign",
        status: "active",
        timezone: "America/Los_Angeles",
      },
    ]);
  });

  afterAll(async () => {
    if (previousLoopback !== undefined) {
      process.env.QENTRAX_ALLOW_LOOPBACK_DELIVERY = previousLoopback;
    } else {
      delete process.env.QENTRAX_ALLOW_LOOPBACK_DELIVERY;
    }
    await new Promise<void>((r) => server.close(() => r()));
  });

  async function newOpportunity(tag: string): Promise<string> {
    const { data } = await supabase
      .from("opportunities")
      .insert({
        public_transaction_id: `QL-RETRY-${tag}-${Date.now()}`,
        publisher_org_id: PUB,
        source_id: SRC,
        vertical_id: VERT,
      })
      .select("id")
      .single();
    return data!.id as string;
  }

  /** deliveries.auction_run_id is NOT NULL: every delivery descends from a run. */
  async function newAuctionRun(opportunityId: string): Promise<string> {
    const { data, error } = await supabase
      .from("auction_runs")
      .insert({
        opportunity_id: opportunityId,
        status: "completed",
        winning_campaign_id: CAMP,
        winning_bid_cents: 4500,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data!.id as string;
  }

  /** A delivery already failed once and due for its next attempt now. */
  async function seedDueDelivery(tag: string, attempt = 1, maxAttempts = 3): Promise<string> {
    const opportunityId = await newOpportunity(tag);
    const auctionRunId = await newAuctionRun(opportunityId);
    const { data, error } = await supabase
      .from("deliveries")
      .insert({
        opportunity_id: opportunityId,
        auction_run_id: auctionRunId,
        campaign_id: CAMP,
        organization_id: ADV,
        endpoint_url: hookUrl,
        request_id: `req-${tag}-${Date.now()}`,
        status: "failed",
        attempt_number: attempt,
        max_attempts: maxAttempts,
        next_attempt_at: new Date(Date.now() - 1000).toISOString(),
        sla_due_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data!.id as string;
  }

  async function readDelivery(id: string) {
    const { data } = await supabase
      .from("deliveries")
      .select("id, status, attempt_number, next_attempt_at, last_error, response_code, opportunity_id")
      .eq("id", id)
      .single();
    return data!;
  }

  /**
   * Each attempt is appended as its own delivery row rather than mutating the
   * first, so the lifecycle is read as the latest attempt for the opportunity.
   */
  async function latestAttempt(seedId: string) {
    const seed = await readDelivery(seedId);
    const { data } = await supabase
      .from("deliveries")
      .select("id, status, attempt_number, next_attempt_at, last_error, response_code")
      .eq("opportunity_id", seed.opportunity_id)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .single();
    return data!;
  }

  async function attemptCount(seedId: string): Promise<number> {
    const seed = await readDelivery(seedId);
    const { count } = await supabase
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("opportunity_id", seed.opportunity_id);
    return count ?? 0;
  }

  it("processes a due delivery and schedules the next attempt on failure", async () => {
    behavior = { kind: "fail", code: 500 };
    const id = await seedDueDelivery("sched", 1, 3);
    hits = 0;

    const result = await processDueDeliveries(supabase, { limit: 10 });

    expect(result.claimed).toBeGreaterThanOrEqual(1);
    // The worker really made the request; this is not simulated.
    expect(hits).toBeGreaterThanOrEqual(1);
    // The outcome must be durably recorded, not silently discarded.
    expect(result.errors).toEqual([]);
    expect(await attemptCount(id)).toBe(2);

    const row = await latestAttempt(id);
    expect(row.attempt_number).toBe(2);
    expect(row.status).not.toBe("accepted");
    // A retryable failure must be scheduled, not dropped.
    expect(row.next_attempt_at).not.toBeNull();
    expect(new Date(row.next_attempt_at as string).getTime()).toBeGreaterThan(Date.now());
  });

  it("succeeds on a later attempt once the destination recovers", async () => {
    behavior = { kind: "fail", code: 503 };
    const id = await seedDueDelivery("recover", 1, 5);

    await processDueDeliveries(supabase, { limit: 10 });
    let row = await latestAttempt(id);
    expect(row.status).not.toBe("accepted");

    // The buyer comes back; make the delivery due again.
    behavior = { kind: "accept" };
    await supabase
      .from("deliveries")
      .update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", row.id);

    await processDueDeliveries(supabase, { limit: 10 });
    row = await latestAttempt(id);

    expect(row.status).toBe("accepted");
    expect(row.response_code).toBe(200);
    // A settled delivery must not stay queued.
    expect(row.next_attempt_at).toBeNull();
  });

  it("reaches a terminal state at the attempt cap instead of retrying forever", async () => {
    behavior = { kind: "fail", code: 500 };
    // Already at the last permitted attempt.
    const id = await seedDueDelivery("deadletter", 3, 3);

    const result = await processDueDeliveries(supabase, { limit: 10 });
    const row = await latestAttempt(id);

    expect(result.errors).toEqual([]);
    expect(row.status).not.toBe("accepted");
    // Exhausted: no further attempt may be scheduled.
    expect(row.next_attempt_at).toBeNull();
    expect(row.attempt_number).toBeGreaterThanOrEqual(3);
    expect(result.exhausted).toBeGreaterThanOrEqual(1);
  });

  it("leaves deliveries that are not yet due untouched", async () => {
    behavior = { kind: "fail", code: 500 };
    const opportunityId = await newOpportunity("future");
    const auctionRunId = await newAuctionRun(opportunityId);
    const { data } = await supabase
      .from("deliveries")
      .insert({
        opportunity_id: opportunityId,
        auction_run_id: auctionRunId,
        campaign_id: CAMP,
        organization_id: ADV,
        endpoint_url: hookUrl,
        request_id: `req-future-${Date.now()}`,
        status: "failed",
        attempt_number: 1,
        max_attempts: 5,
        next_attempt_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .select("id")
      .single();

    hits = 0;
    await processDueDeliveries(supabase, { limit: 10 });

    const row = await latestAttempt(data!.id as string);
    expect(row.attempt_number).toBe(1);
    expect(hits).toBe(0);
  });

  it("is restart-safe: a second pass does not re-send a settled delivery", async () => {
    behavior = { kind: "accept" };
    const id = await seedDueDelivery("idem", 1, 5);

    await processDueDeliveries(supabase, { limit: 10 });
    const first = await latestAttempt(id);
    expect(first.status).toBe("accepted");

    hits = 0;
    await processDueDeliveries(supabase, { limit: 10 });
    const second = await latestAttempt(id);

    expect(second.attempt_number).toBe(first.attempt_number);
    expect(hits).toBe(0);
  });

  it("backs off further with each attempt", async () => {
    expect(computeBackoffMs(2)).toBeGreaterThan(computeBackoffMs(1));
    expect(computeBackoffMs(3)).toBeGreaterThan(computeBackoffMs(2));
  });

  // -------------------------------------------------------------------------
  // Manual replay. The money side must be untouched: the advertiser was
  // charged when the transaction was finalized, and replaying a delivery the
  // buyer never received must not charge again.
  // -------------------------------------------------------------------------
  async function chargedTransaction(tag: string) {
    const opportunityId = await newOpportunity(tag);
    const auctionRunId = await newAuctionRun(opportunityId);

    const { data: reserved, error: reserveError } = await supabase.rpc(
      "reserve_campaign_transaction",
      {
        p_opportunity_id: opportunityId,
        p_publisher_org_id: PUB,
        p_advertiser_org_id: ADV,
        p_campaign_id: CAMP,
        p_price_cents: 4500,
        p_idempotency_key: `replay-${tag}-${Date.now()}`,
      },
    );
    if (reserveError) throw new Error(reserveError.message);
    const transactionId = reserved![0].transaction_id as string;

    const { error: finalizeError } = await supabase.rpc("finalize_campaign_transaction", {
      p_transaction_id: transactionId,
      p_delivery_id: null,
      p_accepted: true,
      p_reason_code: "BUYER_ACCEPTED",
    });
    if (finalizeError) throw new Error(finalizeError.message);

    const { data: delivery } = await supabase
      .from("deliveries")
      .insert({
        opportunity_id: opportunityId,
        auction_run_id: auctionRunId,
        campaign_id: CAMP,
        organization_id: ADV,
        transaction_id: transactionId,
        endpoint_url: hookUrl,
        request_id: `req-replay-${tag}-${Date.now()}`,
        status: "failed",
        attempt_number: 3,
        max_attempts: 3,
        next_attempt_at: null,
      })
      .select("id")
      .single();

    return { transactionId, deliveryId: delivery!.id as string, opportunityId };
  }

  async function transactionState(id: string) {
    const { data } = await supabase
      .from("transactions")
      .select("id, status, advertiser_price_cents, publisher_amount_cents, version")
      .eq("id", id)
      .single();
    return data!;
  }

  async function chargeEventCount(transactionId: string): Promise<number> {
    const { count } = await supabase
      .from("transaction_events")
      .select("id", { count: "exact", head: true })
      .eq("transaction_id", transactionId)
      .eq("event_type", "charged");
    return count ?? 0;
  }

  it("replays a dead-lettered delivery without charging again", async () => {
    behavior = { kind: "accept" };
    const { transactionId, deliveryId } = await chargedTransaction("nodouble");

    const before = await transactionState(transactionId);
    const chargesBefore = await chargeEventCount(transactionId);
    expect(before.status).toBe("charged");
    expect(chargesBefore).toBe(1);

    const result = await replayDelivery(supabase, {
      deliveryId,
      organizationId: ADV,
      actorUserId: null,
      actorOrgId: ADV,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.accepted).toBe(true);
      expect(result.httpStatus).toBe(200);
      expect(result.attemptNumber).toBe(4);
    }

    // The whole point: an auditable new attempt, and money untouched.
    const after = await transactionState(transactionId);
    expect(after.status).toBe("charged");
    expect(after.advertiser_price_cents).toBe(before.advertiser_price_cents);
    expect(after.publisher_amount_cents).toBe(before.publisher_amount_cents);
    expect(after.version).toBe(before.version);
    expect(await chargeEventCount(transactionId)).toBe(1);
  });

  it("records the replay as an auditable attempt", async () => {
    behavior = { kind: "accept" };
    const { deliveryId } = await chargedTransaction("audit");

    const result = await replayDelivery(supabase, { deliveryId, organizationId: ADV });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { data: audit } = await supabase
      .from("audit_events")
      .select("action, resource_type, resource_id, after_redacted")
      .eq("resource_id", result.deliveryId)
      .eq("action", "delivery.replay")
      .maybeSingle();

    expect(audit).not.toBeNull();
    expect(audit!.resource_type).toBe("delivery");
    expect((audit!.after_redacted as Record<string, unknown>).billing_effect).toBe("none");
  });

  it("refuses to replay a delivery the buyer already accepted", async () => {
    behavior = { kind: "accept" };
    const { deliveryId } = await chargedTransaction("accepted");

    // First replay succeeds and lands an accepted attempt.
    const first = await replayDelivery(supabase, { deliveryId, organizationId: ADV });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Replaying the accepted attempt must be refused: the buyer has the lead.
    hits = 0;
    const second = await replayDelivery(supabase, {
      deliveryId: first.deliveryId,
      organizationId: ADV,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("ALREADY_ACCEPTED");
    // Nothing was sent to the buyer.
    expect(hits).toBe(0);
  });

  it("does not replay another tenant's delivery", async () => {
    const { deliveryId } = await chargedTransaction("tenant");
    const result = await replayDelivery(supabase, {
      deliveryId,
      organizationId: "d1000000-0000-0000-0000-00000000ffff",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("DELIVERY_NOT_FOUND");
  });

  it("does not re-enter the automatic retry queue after a replay", async () => {
    behavior = { kind: "fail", code: 500 };
    const { deliveryId } = await chargedTransaction("noqueue");

    const result = await replayDelivery(supabase, { deliveryId, organizationId: ADV });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { data } = await supabase
      .from("deliveries")
      .select("next_attempt_at")
      .eq("id", result.deliveryId)
      .single();
    // A replay is a one-shot operator action.
    expect(data!.next_attempt_at).toBeNull();
  });
});
