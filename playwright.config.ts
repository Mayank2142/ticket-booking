import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: "node node_modules/next/dist/bin/next start",
      url: "http://127.0.0.1:3000/api/ready",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "node node_modules/vite/bin/vite.js preview apps/web --config apps/web/vite.config.ts --host 127.0.0.1",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
