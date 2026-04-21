import { defineConfig, devices } from "@playwright/test";

// Playwright config for the Tastemaker app. Tests assume a Next.js dev
// server is reachable at PLAYWRIGHT_BASE_URL (default localhost:3000).
// We do NOT spawn a webServer here — the user keeps `next dev` running
// manually, and spawning a second instance would fail on the .next/dev/lock.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
