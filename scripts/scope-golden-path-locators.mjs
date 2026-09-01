#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const spec = path.join(process.cwd(), "e2e/golden-path-ui.spec.ts");
let text = readFileSync(spec, "utf8");

const replacements = [
  {
    old: `  await expect(page.getByText(pingBody.public_transaction_id ?? "")).toBeVisible();
  await expect(page.getByText("CHARGED")).toBeVisible();
  await expect(page.getByText("$45.00")).toBeVisible();
`,
    next: `  const publicId = pingBody.public_transaction_id ?? "";
  const oppRow = page.locator(".tableRow.opp").filter({ hasText: publicId });
  await expect(oppRow).toBeVisible();
  await expect(oppRow.locator(".status")).toHaveText("CHARGED");
  await expect(oppRow).toContainText("$45.00");
`,
  },
  {
    old: `  await expect(page.locator(".tableRow.audit")).not.toHaveCount(0);
  await expect(page.getByText("IMMUTABLE")).toBeVisible();
  await expect(page.getByText("ON")).toBeVisible();
`,
    next: `  await expect(page.locator(".tableRow.audit")).not.toHaveCount(0);
  await expect(page.locator(".tableRow.audit .status").filter({ hasText: "opportunity.received" })).toBeVisible();
  await expect(page.getByText("IMMUTABLE", { exact: true })).toBeVisible();
  await expect(page.getByRole("strong").filter({ hasText: /^ON$/ })).toBeVisible();
`,
  },
  {
    old: `  const context = await browser.newContext({ baseURL: APP_URL });
  const page = await context.newPage();

  const ping = await postJson(page, "/api/v1/ping", {
`,
    next: `  const context = await browser.newContext({ baseURL: APP_URL });
  const page = await context.newPage();
  await page.goto("/");

  const ping = await postJson(page, "/api/v1/ping", {
`,
  },
];

for (const { old, next } of replacements) {
  if (text.includes(next.trim())) continue;
  if (!text.includes(old)) {
    console.error("scope-golden-path-locators: expected block not found");
    process.exit(1);
  }
  text = text.replace(old, next);
}

writeFileSync(spec, text);
