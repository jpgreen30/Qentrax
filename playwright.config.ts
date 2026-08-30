import { chromium, defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end configuration.
 *
 * The suite runs against a real Next.js production build talking to a real
 * PostgREST over the project's own migrations, so row-level security and
 * routing behave as they do in production. scripts/e2e-up.sh brings that stack
 * up; the webServer below only starts the application.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  // These walk a stateful chain (schema -> offer -> campaign); parallel runs
  // would race on the shared database.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "e2e-report", open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_APP_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    launchOptions: {
      executablePath: process.env.E2E_CHROME ?? chromium.executablePath(),
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
