#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const spec = path.join(process.cwd(), "e2e/golden-path-ui.spec.ts");
const text = readFileSync(spec, "utf8");
const old = `  await expect(page.getByText(pingBody.public_transaction_id ?? "")).toBeVisible();
  await expect(page.getByText("CHARGED")).toBeVisible();
  await expect(page.getByText("$45.00")).toBeVisible();
`;
const next = `  const publicId = pingBody.public_transaction_id ?? "";
  const oppRow = page.locator(".tableRow.opp").filter({ hasText: publicId });
  await expect(oppRow).toBeVisible();
  await expect(oppRow.locator(".status")).toHaveText("CHARGED");
  await expect(oppRow).toContainText("$45.00");
`;

if (text.includes("const oppRow = page.locator(\".tableRow.opp\")")) {
  process.exit(0);
}
if (!text.includes(old)) {
  console.error("scope-golden-path-locators: expected assertions not found");
  process.exit(1);
}
writeFileSync(spec, text.replace(old, next));
