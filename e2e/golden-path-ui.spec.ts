import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type BrowserContext, type Page, type ConsoleMessage } from "@playwright/test";
import { authCookieName, signIn } from "./harness/session";

/**
 * Walks the chain an operator and a buyer actually take, through the product:
 *
 *   Admin: vertical -> schema draft -> fields -> publish -> offer -> publish
 *   Advertiser: marketplace -> lead specification -> campaign -> review -> activate
 *
 * Nothing here reaches into the database to create a vertical, an offer or a
 * campaign; if a screen cannot do it, this suite fails. The stack underneath is
 * a real Next.js build over real PostgREST with row-level security enforced.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const APP_URL = process.env.E2E_APP_URL ?? "http://127.0.0.1:3000";

const ADMIN = { sub: "e2e00000-0000-0000-0000-00000000a001", email: "admin@qentrax.test" };
const BUYER = { sub: "e2e00000-0000-0000-0000-00000000a002", email: "buyer@atlas.test" };

const ADVERTISER_ORG = "e2e00000-0000-0000-0000-00000000f002";
const PUBLISHER_ORG = "e2e00000-0000-0000-0000-00000000f003";
const SUPPLY = { sub: "e2e00000-0000-0000-0000-00000000a003", email: "supply@northstar.test" };

// Unique per run so repeated runs do not collide on the slug/code constraints.
// verticals.code admits lowercase letters and underscores only, so the suffix
// is encoded into letters rather than base36.
const RUN = Date.now().toString(36).slice(-6).replace(/[0-9]/g, (d) => "ghijklmnop"[Number(d)]);
// "e2e" itself contains a digit, which verticals_code_check forbids.
const VERTICAL_CODE = `qxe_solar_${RUN}`;
const VERTICAL_NAME = `E2E Solar ${RUN}`;
const OFFER_SLUG = `e2e-ca-solar-${RUN}`;
const OFFER_NAME = `E2E California Solar Exclusive ${RUN}`;
const CAMPAIGN_NAME = `E2E CA Solar Buy ${RUN}`;
const SOURCE_NAME = `E2E Source ${RUN}`;
const INTEGRATION_NAME = `E2E Webhook ${RUN}`;
const BUYER_ENDPOINT = `${APP_URL}/api/e2e/buyer`;
const PING_EXTERNAL_ID = `e2e-ping-${RUN}`;
const POST_EXTERNAL_ID = `e2e-post-${RUN}`;
const CONVERSION_EXTERNAL_ID = `e2e-conv-${RUN}`;

/** Console errors and failed requests are defects, not noise. */
type Problems = { console: string[]; network: string[] };

function watch(page: Page): Problems {
  const problems: Problems = { console: [], network: [] };

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // React hydration/devtools chatter from the production build is not expected;
    // record everything and assert on it.
    problems.console.push(text);
  });

  page.on("pageerror", (err) => problems.console.push(`pageerror: ${err.message}`));

  page.on("response", (res) => {
    if (res.status() >= 400) {
      problems.network.push(`${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });

  return problems;
}

function assertClean(problems: Problems, stage: string) {
  expect(problems.console, `console errors during ${stage}`).toEqual([]);
  expect(problems.network, `failed requests during ${stage}`).toEqual([]);
}

function moneyToCents(value: string | null): number {
  if (!value) return 0;
  const parsed = Number(value.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function envFromLocal(name: string): string | undefined {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return undefined;
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1) : undefined;
}

async function postJson(page: Page, path: string, body: Record<string, unknown>) {
  return page.evaluate(
    async ({ appUrl, path, body }) => {
      const response = await fetch(new URL(path, appUrl).toString(), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let json: unknown = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = text;
        }
      }
      return { status: response.status, json };
    },
    { appUrl: APP_URL, path, body },
  );
}

async function createAdvertiserIntegration(page: Page): Promise<string> {
  await page.goto(`/workspace/advertiser/integrations?org=${ADVERTISER_ORG}&integration=new`);
  await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible();

  await page.locator('input[name="name"]').fill(INTEGRATION_NAME);
  await page.locator('input[name="endpoint_url"]').fill(BUYER_ENDPOINT);
  await page.locator('select[name="connector_type"]').selectOption("webhook");
  await page.locator('select[name="method"]').selectOption("POST");
  await page.locator('select[name="auth_type"]').selectOption("none");
  await page.locator('input[name="timeout_ms"]').fill("8000");
  await Promise.all([
    page.waitForURL(
      (url) =>
        url.pathname === "/workspace/advertiser/integrations" &&
        url.searchParams.get("integration") !== null &&
        url.searchParams.get("integration") !== "new",
      { timeout: 15000 },
    ),
    page.getByRole("button", { name: "CREATE INTEGRATION" }).click(),
  ]);

  await expect(page.locator(".formError")).toHaveCount(0);

  const integrationId = new URL(page.url()).searchParams.get("integration");
  expect(integrationId).toBeTruthy();
  expect(integrationId).not.toBe("new");
  return integrationId!;
}

async function createDeliveredCampaign(page: Page, integrationId: string) {
  await page.goto(`/workspace/advertiser/marketplace/${OFFER_SLUG}?org=${ADVERTISER_ORG}`);
  await expect(page.getByRole("heading", { name: OFFER_NAME })).toBeVisible();
  await page.getByRole("link", { name: /CREATE CAMPAIGN/ }).click();
  await expect(page.getByRole("heading", { name: "New campaign" })).toBeVisible();

  await page.locator('input[name="name"]').fill(CAMPAIGN_NAME);
  await page.locator('input[name="base_bid"]').fill("45.00");
  await page.locator('select[name="pacing"]').selectOption("EVEN");
  await page.locator('input[name="states"]').fill("CA");
  await page.locator('input[name="daily_budget"]').fill("500.00");
  await page.locator('select[name="timezone"]').selectOption("America/Los_Angeles");
  await page.locator('select[name="delivery_endpoint_id"]').selectOption(integrationId);
  await page.getByRole("button", { name: /REVIEW CAMPAIGN/ }).click();

  await expect(page.getByRole("heading", { name: CAMPAIGN_NAME })).toBeVisible();
  await expect(page.getByText("webhook →")).toBeVisible();
  await expect(page.getByText(BUYER_ENDPOINT)).toBeVisible();
  await expect(page.getByText(/No delivery integration is attached/)).toHaveCount(0);

  await page.getByRole("button", { name: "ACTIVATE CAMPAIGN" }).click();
  await expect(page).toHaveURL(/\/workspace\/advertiser\/campaigns\?org=/);
  await expect(page.getByText(CAMPAIGN_NAME)).toBeVisible();
}

async function createPublisherSource(page: Page): Promise<string> {
  await page.goto(`/workspace/publisher/sources?org=${PUBLISHER_ORG}`);
  await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();

  await page.locator('input[name="name"]').fill(SOURCE_NAME);
  await page.locator('input[name="channel"]').fill("web");
  await page.locator('input[name="domain"]').fill("example.com");
  await page.getByRole("button", { name: "Create draft source" }).click();

  await expect(page).toHaveURL(/\/workspace\/publisher\?org=/);
  const sourceForm = page.locator("form", {
    has: page.getByRole("button", { name: new RegExp(`Submit test lead · ${SOURCE_NAME}`) }),
  });
  const sourceId = await sourceForm.locator('input[name="source_id"]').inputValue();
  expect(sourceId).toBeTruthy();
  return sourceId;
}

async function pauseCampaignByName(context: BrowserContext, name: string): Promise<void> {
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    envFromLocal("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  expect(publishableKey, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY").toBeTruthy();

  const cookie = (await context.cookies()).find((entry) => entry.name === authCookieName(SUPABASE_URL));
  if (!cookie) throw new Error(`missing auth cookie ${authCookieName(SUPABASE_URL)}`);

  const session = JSON.parse(Buffer.from(cookie.value.replace(/^base64-/, ""), "base64").toString("utf8"));
  const accessToken = session.access_token as string | undefined;
  if (!accessToken) throw new Error("missing access token");

  const url = new URL("/rest/v1/campaigns", SUPABASE_URL);
  url.searchParams.set("name", `eq.${name}`);
  url.searchParams.set("advertiser_org_id", `eq.${ADVERTISER_ORG}`);
  url.searchParams.set("select", "id,status");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`lookup failed: ${response.status}`);
  }

  const rows = (await response.json()) as Array<{ id: string; status: string }>;
  const campaign = rows[0];
  if (!campaign) throw new Error(`campaign not found: ${name}`);

  const patch = await fetch(`${SUPABASE_URL}/rest/v1/campaigns?id=eq.${campaign.id}`, {
    method: "PATCH",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ status: "paused" }),
  });

  if (!patch.ok) {
    throw new Error(`pause failed: ${patch.status}`);
  }

  expect(patch.status).toBe(200);
}

test.describe.configure({ mode: "serial" });

test("admin builds a vertical schema and publishes an offer", async ({ page, context }) => {
  const problems = watch(page);
  await signIn(context, ADMIN, { supabaseUrl: SUPABASE_URL, appUrl: APP_URL });

  // ---- vertical ------------------------------------------------------------
  await page.goto("/workspace/admin/verticals");
  await expect(page.getByRole("heading", { name: "Verticals" })).toBeVisible();

  const newVertical = page.locator("form", { has: page.getByRole("button", { name: "CREATE VERTICAL" }) });
  await newVertical.locator('input[name="code"]').fill(VERTICAL_CODE);
  await newVertical.locator('input[name="name"]').fill(VERTICAL_NAME);
  await page.getByRole("button", { name: "CREATE VERTICAL" }).click();

  await expect(page.getByText(VERTICAL_CODE)).toBeVisible();

  // ---- schema draft --------------------------------------------------------
  await page.getByRole("button", { name: /CREATE FIRST DRAFT|OPEN NEW DRAFT/ }).click();
  // The fields panel header names the version and its state.
  await expect(page.getByRole("heading", { name: /^v1 · DRAFT/ })).toBeVisible();

  // ---- fields --------------------------------------------------------------
  // Form controls are addressed by their `name`, which is stable and unique,
  // rather than by label text that repeats across panels on this page.
  const builder = page.locator("form.fieldBuilder");

  const addField = async (opts: {
    key: string; label: string; type: string; phase: string;
    required?: boolean; pii?: boolean; values?: string; min?: string; max?: string;
  }) => {
    await builder.locator('input[name="field_key"]').fill(opts.key);
    await builder.locator('input[name="label"]').fill(opts.label);
    await builder.locator('select[name="field_type"]').selectOption(opts.type);
    await builder.locator('select[name="phase"]').selectOption(opts.phase);
    await builder.locator('input[name="enum_values"]').fill(opts.values ?? "");
    await builder.locator('input[name="min"]').fill(opts.min ?? "");
    await builder.locator('input[name="max"]').fill(opts.max ?? "");
    if (opts.required) await builder.locator('input[name="required"]').check();
    if (opts.pii) await builder.locator('input[name="is_pii"]').check();
    await page.getByRole("button", { name: "ADD FIELD" }).click();
    // Assert on the fields table specifically. Asserting anywhere on the page
    // false-positives against the <option> list, which contains "zip", "email"
    // and the other type names.
    await expect(
      page.locator(".tableRow.fieldRow code", { hasText: new RegExp(`^${opts.key}$`) }),
    ).toBeVisible();
    // An add that was rejected leaves the banner up; fail loudly rather than
    // silently continuing with a field that was never created.
    await expect(page.locator(".formError")).toHaveCount(0);
  };

  await addField({ key: "zip", label: "ZIP", type: "zip", phase: "ping", required: true });
  await addField({ key: "state", label: "State", type: "text", phase: "ping", required: true });
  await addField({
    key: "email", label: "Email", type: "email", phase: "post", required: true, pii: true,
  });
  await addField({
    key: "roof_type", label: "Roof type", type: "enum", phase: "post",
    values: "shingle, tile, metal",
  });
  await addField({
    key: "monthly_bill", label: "Monthly bill", type: "integer", phase: "post",
    min: "50", max: "2000",
  });

  // The builder must reject an enum with no values, matching the DB constraint.
  await builder.locator('input[name="field_key"]').fill("bad_enum");
  await builder.locator('input[name="label"]').fill("Bad enum");
  await builder.locator('select[name="field_type"]').selectOption("enum");
  await builder.locator('input[name="enum_values"]').fill("");
  await page.getByRole("button", { name: "ADD FIELD" }).click();
  await expect(page.getByText(/at least one allowed value/)).toBeVisible();

  // ---- publish the schema --------------------------------------------------
  await page.getByRole("button", { name: /PUBLISH v1/ }).click();
  await expect(page.getByRole("heading", { name: /^v1 · PUBLISHED/ })).toBeVisible();

  // A published version is read-only: the builder must be gone.
  await expect(page.getByRole("button", { name: "ADD FIELD" })).toHaveCount(0);

  assertClean(problems, "admin schema authoring");

  // ---- offer ---------------------------------------------------------------
  await page.goto("/workspace/admin/offers");
  await expect(page.getByRole("heading", { name: "Offers" })).toBeVisible();

  const newOffer = page.locator("form", { has: page.getByRole("button", { name: "CREATE OFFER" }) });
  await newOffer.locator('select[name="vertical_id"]').selectOption({ label: VERTICAL_NAME });
  await newOffer.locator('input[name="name"]').fill(OFFER_NAME);
  await newOffer.locator('input[name="slug"]').fill(OFFER_SLUG);
  await page.getByRole("button", { name: "CREATE OFFER" }).click();
  await expect(page.getByText(OFFER_SLUG)).toBeVisible();

  // ---- configure and publish the offer -------------------------------------
  const offerForm = page.locator("form.fieldBuilder");
  await offerForm.locator('select[name="lead_type"]').selectOption("exclusive");
  await offerForm.locator('select[name="pricing_mode"]').selectOption("fixed");
  await offerForm.locator('input[name="price"]').fill("45.00");
  await offerForm.locator('input[name="states_include"]').fill("CA");
  await offerForm.locator('input[name="max_lead_age_minutes"]').fill("30");
  await offerForm.locator('input[name="return_window_hours"]').fill("72");
  await offerForm.locator('input[name="require_consent"]').check();
  await page.getByRole("button", { name: "CREATE VERSION 1" }).click();

  await page.getByRole("button", { name: /PUBLISH v1/ }).click();
  await expect(page.getByText("LIVE")).toBeVisible();

  assertClean(problems, "admin offer publishing");
});

test("advertiser reads the specification and activates a campaign", async ({ page, context }) => {
  const problems = watch(page);
  await signIn(context, BUYER, { supabaseUrl: SUPABASE_URL, appUrl: APP_URL });

  // ---- marketplace ---------------------------------------------------------
  await page.goto(`/workspace/advertiser/marketplace?org=${ADVERTISER_ORG}`);
  await expect(page.getByRole("heading", { name: "Browse offers" })).toBeVisible();
  await expect(page.getByText(OFFER_NAME)).toBeVisible();

  await page.getByRole("link", { name: /VIEW LEAD SPECIFICATION/ }).first().click();

  // ---- lead specification --------------------------------------------------
  await expect(page.getByRole("heading", { name: OFFER_NAME })).toBeVisible();

  // The governing versions must be stated, not implied.
  await expect(page.getByText(/offer v1 · schema v1/)).toBeVisible();

  // Every authored field appears with its contract.
  for (const key of ["zip", "state", "email", "roof_type", "monthly_bill"]) {
    await expect(page.getByText(key, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText("REQUIRED").first()).toBeVisible();
  await expect(page.getByText("PII").first()).toBeVisible();
  await expect(page.getByText("shingle, tile, metal")).toBeVisible();

  // ---- generated examples must be real and valid ----------------------------
  const blocks = await page.locator("pre.codeBlock").allTextContents();
  const ping = JSON.parse(blocks[0]);
  const post = JSON.parse(blocks[1]);

  // ping carries the ping-phase fields and none of the post-only ones.
  expect(Object.keys(ping).sort()).toEqual(["state", "zip"]);
  expect(String(ping.zip)).toMatch(/^\d{5}$/);
  expect(post).toHaveProperty("email");
  expect(String(post.email)).toContain("@");
  expect(["shingle", "tile", "metal"]).toContain(post.roof_type);
  // The declared minimum must be honoured by the example.
  expect(Number(post.monthly_bill)).toBeGreaterThanOrEqual(50);

  // The generated JSON Schema must agree with the authored fields.
  const schema = JSON.parse(blocks[2]);
  expect(schema.required.sort()).toEqual(["state", "zip"]);
  expect(schema.additionalProperties).toBe(false);
  expect(schema.properties.zip.pattern).toBeTruthy();

  assertClean(problems, "lead specification");

  // ---- campaign builder ----------------------------------------------------
  await page.getByRole("link", { name: /CREATE CAMPAIGN/ }).click();
  await expect(page.getByRole("heading", { name: "New campaign" })).toBeVisible();

  await page.locator('input[name="name"]').fill(CAMPAIGN_NAME);
  await page.locator('input[name="base_bid"]').fill("45.00");
  await page.locator('select[name="pacing"]').selectOption("EVEN");
  await page.locator('input[name="states"]').fill("CA");

  await page.locator('input[name="hourly_cap"]').fill("5");
  await page.locator('input[name="daily_cap"]').fill("50");
  await page.locator('input[name="monthly_cap"]').fill("1000");
  await page.locator('input[name="daily_budget"]').fill("500.00");
  await page.locator('input[name="monthly_budget"]').fill("9000.00");

  await page.locator('select[name="timezone"]').selectOption("America/Los_Angeles");

  // Weekday business-hours daypart.
  await page.locator('select[name="daypart_day"]').first().selectOption("1");
  await page.locator('input[name="daypart_start"]').first().fill("09:00");
  await page.locator('input[name="daypart_end"]').first().fill("17:00");
  await page.locator('select[name="daypart_day"]').nth(1).selectOption("2");
  await page.locator('input[name="daypart_start"]').nth(1).fill("09:00");
  await page.locator('input[name="daypart_end"]').nth(1).fill("17:00");

  await page.getByRole("button", { name: /REVIEW CAMPAIGN/ }).click();

  // ---- review --------------------------------------------------------------
  await expect(page.getByRole("heading", { name: CAMPAIGN_NAME })).toBeVisible();
  await expect(page.getByText("$45.00")).toBeVisible();
  await expect(page.getByText("$500.00")).toBeVisible();
  await expect(page.getByText("America/Los_Angeles").first()).toBeVisible();
  await expect(page.getByText(/Mon 09:00–17:00, Tue 09:00–17:00/)).toBeVisible();
  await expect(page.getByText("v1 (pinned)")).toBeVisible();

  // ---- activation ----------------------------------------------------------
  // A campaign with no delivery integration must not be activatable: leads
  // would have nowhere to go.
  await expect(
    page.getByText(/No delivery integration is attached/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "ACTIVATE CAMPAIGN" })).toHaveCount(0);

  assertClean(problems, "campaign review");
});

test("a campaign with a delivery destination can be activated", async ({ page, context }) => {
  const problems = watch(page);
  await signIn(context, BUYER, { supabaseUrl: SUPABASE_URL, appUrl: APP_URL });

  await page.goto(`/workspace/advertiser/campaigns/new?org=${ADVERTISER_ORG}`);

  await page.locator('input[name="name"]').fill(`${CAMPAIGN_NAME} delivered`);
  await page.locator('input[name="base_bid"]').fill("45.00");
  await page.locator('input[name="states"]').fill("CA");
  await page.locator('input[name="daily_cap"]').fill("25");
  await page.locator('input[name="daily_budget"]').fill("500.00");
  await page.locator('select[name="timezone"]').selectOption("America/Los_Angeles");

  // The seeded connector is offered as a delivery destination.
  const destination = page.locator('select[name="delivery_endpoint_id"]');
  await expect(destination).toBeVisible();
  await destination.selectOption({ index: 1 });

  await page.getByRole("button", { name: /REVIEW CAMPAIGN/ }).click();

  await expect(page.getByText(/webhook →/)).toBeVisible();
  await expect(page.getByText(/No delivery integration is attached/)).toHaveCount(0);

  await page.getByRole("button", { name: "ACTIVATE CAMPAIGN" }).click();

  // Landing on the campaigns list with the campaign live is the proof that a
  // buyer reached an active campaign without touching the database.
  await expect(page).toHaveURL(/\/workspace\/advertiser\/campaigns\?org=/);
  await expect(page.getByText(`${CAMPAIGN_NAME} delivered`)).toBeVisible();

  assertClean(problems, "campaign activation");
});

test("the builder rejects a bid the offer would never honour", async ({ page, context }) => {
  const problems = watch(page);
  await signIn(context, BUYER, { supabaseUrl: SUPABASE_URL, appUrl: APP_URL });

  await page.goto(`/workspace/advertiser/campaigns/new?org=${ADVERTISER_ORG}`);
  await page.locator('input[name="name"]').fill(`${CAMPAIGN_NAME} bad`);
  await page.locator('input[name="base_bid"]').fill("10.00");
  await page.getByRole("button", { name: /REVIEW CAMPAIGN/ }).click();

  // A fixed-price offer must reject a mismatched bid, in the product.
  await expect(page.getByText(/fixed price/)).toBeVisible();

  // Console/network must stay clean even on the rejection path.
  expect(problems.console, "console errors on validation rejection").toEqual([]);
});

test("publisher discovers live demand and reads the intake contract", async ({ page, context }) => {
  const problems = watch(page);
  await signIn(context, SUPPLY, { supabaseUrl: SUPABASE_URL, appUrl: APP_URL });

  await page.goto(`/workspace/publisher/demand?org=${PUBLISHER_ORG}`);
  await expect(page.getByRole("heading", { name: "Available demand" })).toBeVisible();

  // The offer published earlier is discoverable, because a campaign activated
  // against it in the previous test.
  await expect(page.getByRole("heading", { name: OFFER_NAME })).toBeVisible();

  // The publisher sees their own rate, not the advertiser's price. The offer is
  // fixed at $45.00 and the split is 85%, so the quoted rate is $38.25.
  await expect(page.getByText("$38.25")).toBeVisible();
  await expect(page.getByText("PER ACCEPTED LEAD")).toBeVisible();
  await expect(page.getByText("$45.00")).toHaveCount(0);

  // Geography, consent and lead age come from the offer's frozen terms.
  await expect(page.getByText("CA", { exact: true })).toBeVisible();
  await expect(page.getByText("CONSENT REQUIRED")).toBeVisible();
  await expect(page.getByText("30 min")).toBeVisible();

  // Ping and post requirements are split correctly.
  const ping = page.locator(".demandFields", { hasText: "PING FIELDS" });
  const post = page.locator(".demandFields", { hasText: "POST FIELDS" });
  await expect(ping.locator("code", { hasText: /^zip$/ })).toBeVisible();
  await expect(ping.locator("code", { hasText: /^state$/ })).toBeVisible();
  await expect(ping.locator("code", { hasText: /^email$/ })).toHaveCount(0);
  await expect(post.locator("code", { hasText: /^email$/ })).toBeVisible();
  await expect(post.locator("code", { hasText: /^roof_type$/ })).toBeVisible();

  assertClean(problems, "publisher demand discovery");

  // ---- intake guide --------------------------------------------------------
  await page.getByRole("link", { name: /INTEGRATION GUIDE/ }).first().click();
  await expect(page.getByRole("heading", { name: OFFER_NAME })).toBeVisible();

  await expect(page.getByText("/api/v1/ping")).toBeVisible();
  await expect(page.getByText("/api/v1/post")).toBeVisible();
  await expect(page.getByText(/SCHEMA_MISSING_FIELD/)).toBeVisible();
  await expect(page.getByText(/CONSENT_MISSING/)).toBeVisible();

  // The documented examples must match the published contract, not prose.
  const blocks = await page.locator("pre.codeBlock").allTextContents();
  const pingExample = JSON.parse(blocks[0]);
  const postExample = JSON.parse(blocks[1]);
  expect(Object.keys(pingExample).sort()).toEqual(["state", "zip"]);
  expect(postExample).toHaveProperty("email");
  expect(["shingle", "tile", "metal"]).toContain(postExample.roof_type);

  assertClean(problems, "publisher intake guide");
});

test("golden path reaches billing, ping, post, conversion, reporting, and audit", async ({ page, context }) => {
  const problems = watch(page);

  await signIn(context, BUYER, { supabaseUrl: SUPABASE_URL, appUrl: APP_URL });

  // ---- billing -------------------------------------------------------------
  await page.goto(`/workspace/advertiser/billing?org=${ADVERTISER_ORG}`);
  await expect(page.getByRole("heading", { name: "Billing & funding" })).toBeVisible();

  const balanceBefore = moneyToCents(
    await page.locator(".dashStats article").first().locator("strong").textContent(),
  );
  await page.getByRole("button", { name: "Post $500 test funding" }).click();
  await expect(page).toHaveURL(/funded=1/);
  await expect(page.getByText(/Funding received/)).toBeVisible();
  const balanceAfter = moneyToCents(
    await page.locator(".dashStats article").first().locator("strong").textContent(),
  );
  expect(balanceAfter).toBeGreaterThanOrEqual(balanceBefore + 50000);

  // The earlier active campaign from the lightweight activation test can tie
  // this new campaign on bid, so park it before we run the real delivery path.
  await pauseCampaignByName(context, `${CAMPAIGN_NAME} delivered`);
  assertClean(problems, "billing and campaign parking");

  // ---- integration + campaign ---------------------------------------------
  const integrationId = await createAdvertiserIntegration(page);
  await createDeliveredCampaign(page, integrationId);
  assertClean(problems, "campaign delivery setup");

  // ---- publisher source ----------------------------------------------------
  await signIn(context, SUPPLY, { supabaseUrl: SUPABASE_URL, appUrl: APP_URL });
  const sourceId = await createPublisherSource(page);
  const consumer = {
    first_name: "Test",
    last_name: "Lead",
    email: "test.lead@example.com",
    phone: "3105550100",
  };
  const attributes = {
    zip: "90210",
    state: "CA",
    roof_type: "shingle",
    monthly_bill: 150,
  };
  const consent = {
    tcpa_consent: true,
    tcpa_text: "I agree to be contacted by phone, SMS, and email regarding solar offers.",
  };

  // ---- ping ---------------------------------------------------------------
  const ping = await postJson(page, "/api/v1/ping", {
    source_id: sourceId,
    external_submission_id: PING_EXTERNAL_ID,
    vertical: VERTICAL_CODE,
    consumer,
    attributes,
    consent,
  });
  expect(ping.status).toBe(200);
  const pingBody = ping.json as {
    ok?: boolean;
    public_transaction_id?: string;
    winning_campaign_id?: string | null;
    winning_bid_cents?: number | null;
    eligible_buyer_count?: number;
  };
  expect(pingBody.ok).toBe(true);
  expect(pingBody.public_transaction_id).toMatch(/^QL-/);
  expect(pingBody.winning_campaign_id).toBeTruthy();
  expect(pingBody.winning_bid_cents).toBe(4500);
  expect(pingBody.eligible_buyer_count ?? 0).toBeGreaterThan(0);

  // ---- post ---------------------------------------------------------------
  const post = await postJson(page, "/api/v1/post", {
    public_transaction_id: pingBody.public_transaction_id,
    source_id: sourceId,
    external_submission_id: PING_EXTERNAL_ID,
    consumer,
    attributes,
    consent,
  });
  expect(post.status).toBe(200);
  const postBody = post.json as {
    ok?: boolean;
    transaction_id?: string;
    delivered_to_campaign_id?: string;
    status?: string;
    charge_cents?: number;
  };
  expect(postBody.ok).toBe(true);
  expect(postBody.transaction_id).toBeTruthy();
  expect(postBody.delivered_to_campaign_id).toBeTruthy();
  expect(postBody.status).toBe("accepted");
  expect(postBody.charge_cents).toBe(4500);

  const idempotencyMismatch = await postJson(page, "/api/v1/post", {
    public_transaction_id: pingBody.public_transaction_id,
    source_id: sourceId,
    external_submission_id: POST_EXTERNAL_ID,
    consumer,
    attributes,
    consent,
  });
  expect(idempotencyMismatch.status).toBe(400);
  expect((idempotencyMismatch.json as { error?: { code?: string } }).error?.code).toBe(
    "IDEMPOTENCY_MISMATCH",
  );

  problems.console.length = 0;
  problems.network.length = 0;

  // ---- conversion ---------------------------------------------------------
  await signIn(context, BUYER, { supabaseUrl: SUPABASE_URL, appUrl: APP_URL });
  const missingDisposition = await postJson(page, "/api/v1/conversions", {
    transaction_id: postBody.transaction_id,
  });
  expect(missingDisposition.status).toBe(400);
  expect((missingDisposition.json as { error?: { code?: string } }).error?.code).toBe(
    "VALIDATION_ERROR",
  );

  problems.console.length = 0;
  problems.network.length = 0;

  const sale = await postJson(page, "/api/v1/conversions", {
    transaction_id: postBody.transaction_id,
    disposition: "sale",
    revenue_cents: 18000,
    external_event_id: CONVERSION_EXTERNAL_ID,
  });
  expect(sale.status).toBe(201);
  const saleBody = sale.json as { ok?: boolean; duplicate?: boolean };
  expect(saleBody.ok).toBe(true);
  expect(saleBody.duplicate).toBe(false);

  const saleAgain = await postJson(page, "/api/v1/conversions", {
    transaction_id: postBody.transaction_id,
    disposition: "sale",
    revenue_cents: 18000,
    external_event_id: CONVERSION_EXTERNAL_ID,
  });
  expect(saleAgain.status).toBe(200);
  expect((saleAgain.json as { duplicate?: boolean }).duplicate).toBe(true);

  // ---- opportunities + reporting -----------------------------------------
  await page.goto(`/workspace/advertiser/opportunities?org=${ADVERTISER_ORG}`);
  await expect(page.getByText(pingBody.public_transaction_id ?? "")).toBeVisible();
  await expect(page.getByText("CHARGED")).toBeVisible();
  await expect(page.getByText("$45.00")).toBeVisible();

  await page.goto(`/workspace/advertiser/reports?org=${ADVERTISER_ORG}&range=30d`);
  const reportStats = page.locator(".dashStats article");
  await expect(reportStats.nth(0)).toContainText("$45.00");
  await expect(reportStats.nth(1)).toContainText("1");
  await expect(reportStats.nth(2)).toContainText("1");
  await expect(reportStats.nth(3)).toContainText("$180.00");
  await expect(page.getByText("ROAS 4.00x")).toBeVisible();

  // ---- audit --------------------------------------------------------------
  await signIn(context, ADMIN, { supabaseUrl: SUPABASE_URL, appUrl: APP_URL });
  await page.goto("/workspace/admin/audit");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect(page.locator(".tableRow.audit")).not.toHaveCount(0);
  await expect(page.getByText("IMMUTABLE")).toBeVisible();
  await expect(page.getByText("ON")).toBeVisible();

  assertClean(problems, "golden path");
});

test("unsigned API callers are rejected before validation", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: APP_URL });
  const page = await context.newPage();

  const ping = await postJson(page, "/api/v1/ping", {
    source_id: "missing",
    external_submission_id: `anon-${RUN}`,
    vertical: VERTICAL_CODE,
  });
  expect(ping.status).toBe(401);
  expect((ping.json as { error?: { code?: string } }).error?.code).toBe("AUTH_REQUIRED");

  const post = await postJson(page, "/api/v1/post", {
    public_transaction_id: "QL-00000",
    source_id: "missing",
    external_submission_id: `anon-${RUN}`,
    consumer: {},
    attributes: {},
    consent: {},
  });
  expect(post.status).toBe(401);
  expect((post.json as { error?: { code?: string } }).error?.code).toBe("AUTH_REQUIRED");

  const conversion = await postJson(page, "/api/v1/conversions", {
    transaction_id: "txn-missing",
    disposition: "sale",
  });
  expect(conversion.status).toBe(401);
  expect((conversion.json as { error?: { code?: string } }).error?.code).toBe("AUTH_REQUIRED");

  await context.close();
});
