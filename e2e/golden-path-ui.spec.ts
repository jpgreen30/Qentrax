import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { signIn } from "./harness/session";

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
