import { describe, it, expect, beforeAll } from "vitest";
import { createSign } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { recordConversion } from "./record";
import { computeTotals, computeCampaignBreakdown } from "@/lib/reporting/metrics";
import { resolveDateRange } from "@/lib/reporting/date-range";
import {
  fetchAdvertiserTransactions,
  fetchAdvertiserConversions,
} from "@/lib/reporting/queries";

/**
 * Conversion recording against the real database, so authorization,
 * idempotency and the billable-transaction rule are proven rather than mocked.
 * Skipped unless the local stack is up.
 */
const KEY_PATH = path.join(process.cwd(), "e2e/harness/jwt-private.pem");
const STACK_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const STACK_UP = existsSync(KEY_PATH) && process.env.E2E_STACK === "1";

const ADV = "c2000000-0000-0000-0000-0000000000a1";
const OTHER_ADV = "c2000000-0000-0000-0000-0000000000a2";
const PUB = "c2000000-0000-0000-0000-0000000000b1";
const VERT = "c2000000-0000-0000-0000-0000000000c1";
const SRC = "c2000000-0000-0000-0000-0000000000d1";
const CAMP = "c2000000-0000-0000-0000-0000000000e1";

function serviceToken(): string {
  const b = (x: string) => Buffer.from(x).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const si = `${b(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "qentrax-e2e" }))}.${b(
    JSON.stringify({
      iss: `${STACK_URL}/auth/v1`,
      aud: "authenticated",
      role: "service_role",
      sub: "00000000-0000-0000-0000-0000000000fe",
      iat: now,
      exp: now + 3600,
    }),
  )}`;
  const signer = createSign("RSA-SHA256");
  signer.update(si);
  return `${si}.${signer.sign(readFileSync(KEY_PATH, "utf8"), "base64url")}`;
}

let supabase: SupabaseClient;

describe.skipIf(!STACK_UP)("conversion recording (live stack)", () => {
  beforeAll(async () => {
    supabase = createClient(STACK_URL, "test-key", {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${serviceToken()}` } },
    });

    await supabase.from("organizations").upsert([
      { id: ADV, type: "advertiser", legal_name: "Conversion Advertiser" },
      { id: OTHER_ADV, type: "advertiser", legal_name: "Other Advertiser" },
      { id: PUB, type: "publisher", legal_name: "Conversion Publisher" },
    ]);
    await supabase.from("verticals").upsert([{ id: VERT, code: "convv", name: "Conv" }]);
    await supabase
      .from("publisher_sources")
      .upsert([{ id: SRC, publisher_org_id: PUB, name: "Conv Source" }]);
    await supabase.from("campaigns").upsert([
      {
        id: CAMP,
        advertiser_org_id: ADV,
        name: "Conversion Campaign",
        status: "active",
        timezone: "America/Los_Angeles",
      },
    ]);
  });

  /** Produces a charged transaction the way the router does. */
  async function chargedTransaction(tag: string): Promise<string> {
    const { data: opp } = await supabase
      .from("opportunities")
      .insert({
        public_transaction_id: `QL-CONV-${tag}-${Date.now()}`,
        publisher_org_id: PUB,
        source_id: SRC,
        vertical_id: VERT,
      })
      .select("id")
      .single();

    const { data: reserved } = await supabase.rpc("reserve_campaign_transaction", {
      p_opportunity_id: opp!.id,
      p_publisher_org_id: PUB,
      p_advertiser_org_id: ADV,
      p_campaign_id: CAMP,
      p_price_cents: 4500,
      p_idempotency_key: `conv-${tag}-${Date.now()}`,
    });
    const transactionId = reserved![0].transaction_id as string;

    await supabase.rpc("finalize_campaign_transaction", {
      p_transaction_id: transactionId,
      p_delivery_id: null,
      p_accepted: true,
      p_reason_code: "BUYER_ACCEPTED",
    });
    return transactionId;
  }

  async function reservedTransaction(tag: string): Promise<string> {
    const { data: opp } = await supabase
      .from("opportunities")
      .insert({
        public_transaction_id: `QL-CONVR-${tag}-${Date.now()}`,
        publisher_org_id: PUB,
        source_id: SRC,
        vertical_id: VERT,
      })
      .select("id")
      .single();

    const { data: reserved } = await supabase.rpc("reserve_campaign_transaction", {
      p_opportunity_id: opp!.id,
      p_publisher_org_id: PUB,
      p_advertiser_org_id: ADV,
      p_campaign_id: CAMP,
      p_price_cents: 4500,
      p_idempotency_key: `convr-${tag}-${Date.now()}`,
    });
    return reserved![0].transaction_id as string;
  }

  it("records a sale with revenue", async () => {
    const transactionId = await chargedTransaction("sale");
    const r = await recordConversion(supabase, {
      advertiserOrgId: ADV,
      transactionId,
      disposition: "sale",
      revenueCents: 25000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.duplicate).toBe(false);

    const { data } = await supabase
      .from("conversion_events")
      .select("event_type, revenue_cents, validation_status")
      .eq("transaction_id", transactionId)
      .single();
    expect(data!.event_type).toBe("sale");
    expect(data!.revenue_cents).toBe(25000);
  });

  it("is idempotent: the same event twice does not inflate revenue", async () => {
    const transactionId = await chargedTransaction("idem");
    const key = `crm-evt-${Date.now()}`;

    const first = await recordConversion(supabase, {
      advertiserOrgId: ADV, transactionId, disposition: "sale",
      revenueCents: 10000, externalEventId: key,
    });
    const second = await recordConversion(supabase, {
      advertiserOrgId: ADV, transactionId, disposition: "sale",
      revenueCents: 10000, externalEventId: key,
    });

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.duplicate).toBe(true);
      expect(second.id).toBe(first.id);
    }

    const { count } = await supabase
      .from("conversion_events")
      .select("id", { count: "exact", head: true })
      .eq("transaction_id", transactionId);
    expect(count).toBe(1);
  });

  it("deduplicates a repeated disposition even without a caller-supplied key", async () => {
    const transactionId = await chargedTransaction("nokey");
    await recordConversion(supabase, { advertiserOrgId: ADV, transactionId, disposition: "sale", revenueCents: 5000 });
    const again = await recordConversion(supabase, { advertiserOrgId: ADV, transactionId, disposition: "sale", revenueCents: 5000 });
    expect(again.ok && again.duplicate).toBe(true);

    const { count } = await supabase
      .from("conversion_events")
      .select("id", { count: "exact", head: true })
      .eq("transaction_id", transactionId)
      .eq("event_type", "sale");
    expect(count).toBe(1);
  });

  it("records only one revenue-bearing event per transaction, whatever the key", async () => {
    const transactionId = await chargedTransaction("onesale");

    const first = await recordConversion(supabase, {
      advertiserOrgId: ADV, transactionId, disposition: "sale",
      revenueCents: 20000, externalEventId: `crm-a-${Date.now()}`,
    });
    // A different external id must not open a second sale on the same lead.
    const second = await recordConversion(supabase, {
      advertiserOrgId: ADV, transactionId, disposition: "sale",
      revenueCents: 50000, externalEventId: `crm-b-${Date.now()}`,
    });

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.duplicate).toBe(true);
      expect(second.id).toBe(first.id);
    }

    const { data } = await supabase
      .from("conversion_events")
      .select("revenue_cents")
      .eq("transaction_id", transactionId)
      .eq("event_type", "sale");
    expect(data).toHaveLength(1);
    expect(data![0].revenue_cents).toBe(20000);
  });

  it("allows distinct funnel stages on the same lead", async () => {
    const transactionId = await chargedTransaction("funnel");
    for (const d of ["contacted", "qualified", "sale"]) {
      const r = await recordConversion(supabase, {
        advertiserOrgId: ADV, transactionId, disposition: d,
        revenueCents: d === "sale" ? 30000 : null,
      });
      expect(r.ok, `${d} should record`).toBe(true);
    }
    const { count } = await supabase
      .from("conversion_events")
      .select("id", { count: "exact", head: true })
      .eq("transaction_id", transactionId);
    expect(count).toBe(3);
  });

  it("refuses a conversion on another advertiser's transaction", async () => {
    const transactionId = await chargedTransaction("tenant");
    const r = await recordConversion(supabase, {
      advertiserOrgId: OTHER_ADV, transactionId, disposition: "sale", revenueCents: 1000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TRANSACTION_NOT_FOUND");
  });

  it("refuses a conversion on a lead that was never charged", async () => {
    const transactionId = await reservedTransaction("unbilled");
    const r = await recordConversion(supabase, {
      advertiserOrgId: ADV, transactionId, disposition: "sale", revenueCents: 1000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TRANSACTION_NOT_BILLABLE");
  });

  it("rejects revenue on a non-revenue disposition", async () => {
    const transactionId = await chargedTransaction("badrev");
    const r = await recordConversion(supabase, {
      advertiserOrgId: ADV, transactionId, disposition: "contacted", revenueCents: 9999,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_REVENUE");
  });

  it("rejects an unknown disposition and a negative or fractional amount", async () => {
    const transactionId = await chargedTransaction("invalid");
    const bad = await recordConversion(supabase, {
      advertiserOrgId: ADV, transactionId, disposition: "won", revenueCents: 100,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("INVALID_DISPOSITION");

    for (const revenueCents of [-1, 10.5]) {
      const r = await recordConversion(supabase, {
        advertiserOrgId: ADV, transactionId, disposition: "sale", revenueCents,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("INVALID_REVENUE");
    }
  });

  // -------------------------------------------------------------------------
  // Phase 10 requires that changing persisted data actually changes what
  // reporting aggregates. This reads through the same query and metric code
  // the advertiser report renders with.
  // -------------------------------------------------------------------------
  it("feeds revenue, ROAS and attribution into the reporting engine", async () => {
    const range = resolveDateRange({ range: "30d" }, "America/Los_Angeles");

    const readReport = async () => {
      const [txns, conversions] = await Promise.all([
        fetchAdvertiserTransactions(supabase, ADV, range),
        fetchAdvertiserConversions(supabase, ADV, range),
      ]);
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id, name")
        .eq("advertiser_org_id", ADV);
      return {
        totals: computeTotals(txns, conversions),
        breakdown: computeCampaignBreakdown(txns, conversions, campaigns ?? []),
      };
    };

    const before = await readReport();

    // A newly charged lead moves spend before any conversion exists.
    const transactionId = await chargedTransaction("reporting");
    const afterSpend = await readReport();

    expect(afterSpend.totals.billableLeads).toBe(before.totals.billableLeads + 1);
    expect(afterSpend.totals.spendCents).toBe(before.totals.spendCents + 4500);

    // Reporting a sale moves revenue and ROAS.
    const sale = await recordConversion(supabase, {
      advertiserOrgId: ADV,
      transactionId,
      disposition: "sale",
      revenueCents: 18000,
      externalEventId: `reporting-${Date.now()}`,
    });
    expect(sale.ok).toBe(true);

    const afterSale = await readReport();
    expect(afterSale.totals.revenueCents).toBe(afterSpend.totals.revenueCents + 18000);
    expect(afterSale.totals.sales).toBe(afterSpend.totals.sales + 1);
    expect(afterSale.totals.roas).not.toBeNull();
    expect(afterSale.totals.roas!).toBeGreaterThan(afterSpend.totals.roas ?? 0);

    // Revenue is attributed to the campaign that produced the lead.
    const row = afterSale.breakdown.find((r) => r.campaignId === CAMP);
    expect(row).toBeDefined();
    expect(row!.revenueCents).toBeGreaterThanOrEqual(18000);
    expect(row!.roas).not.toBeNull();

    // Re-reporting a sale for this transaction is refused as a duplicate even
    // under a different external id, so revenue cannot be counted twice.
    const repeat = await recordConversion(supabase, {
      advertiserOrgId: ADV,
      transactionId,
      disposition: "sale",
      revenueCents: 18000,
    });
    expect(repeat.ok).toBe(true);

    const afterRepeat = await readReport();
    expect(afterRepeat.totals.sales).toBe(afterSale.totals.sales);
    expect(afterRepeat.totals.revenueCents).toBe(afterSale.totals.revenueCents);
  });
});
