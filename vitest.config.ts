import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: {
    environment: "node",
    coverage: { reporter: ["text", "json"] },
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/mcp/**/*.test.ts",
      // Browser end-to-end specs are driven by Playwright, not Vitest.
      "**/e2e/**",
    ],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
