import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(rootDir, "apps/admin-web/src"),
      "@fococontext/contracts": resolve(rootDir, "packages/contracts/src/index.ts"),
      "@fococontext/core": resolve(rootDir, "packages/core/src/index.ts"),
      "@fococontext/db": resolve(rootDir, "packages/db/src/index.ts"),
      "@fococontext/graph": resolve(rootDir, "packages/graph/src/index.ts"),
      "@fococontext/llm": resolve(rootDir, "packages/llm/src/index.ts"),
      "@fococontext/parsers": resolve(rootDir, "packages/parsers/src/index.ts"),
      "@fococontext/retrieval": resolve(rootDir, "packages/retrieval/src/index.ts"),
      "@fococontext/sdk-js": resolve(rootDir, "packages/sdk-js/src/index.ts"),
      "@fococontext/storage": resolve(rootDir, "packages/storage/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      "apps/**/src/**/*.test.ts",
      "packages/**/src/**/*.test.ts",
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/contract/**/*.test.ts",
      "tests/migration/**/*.test.ts",
    ],
    exclude: ["tests/e2e/**", "**/node_modules/**", "**/dist/**"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/vitest",
      reporter: ["text", "json", "html"],
    },
  },
});
