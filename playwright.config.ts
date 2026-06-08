import { defineConfig, devices } from "@playwright/test";

const adminPort = Number(process.env.FOCOCONTEXT_ADMIN_PORT ?? 18081);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${adminPort}`;
const browserChannel = process.env.PLAYWRIGHT_CHROME_CHANNEL;
const optionalBrowserChannel = browserChannel === undefined ? {} : { channel: browserChannel };

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/playwright",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...optionalBrowserChannel },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"], ...optionalBrowserChannel },
    },
  ],
  webServer:
    process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1"
      ? undefined
      : {
          command: `pnpm --filter @fococontext/admin-web dev --host 127.0.0.1 --port ${adminPort}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          stdout: "pipe",
          stderr: "pipe",
        },
});
