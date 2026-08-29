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
    ],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
