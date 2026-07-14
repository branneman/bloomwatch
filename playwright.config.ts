import { defineConfig } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

export default defineConfig({
  testDir: "./test/e2e",
  // The real WCL API's response time varies enough to intermittently blow past the
  // 5s default (seen twice in CI, e.g. GitHub Actions run 29206216460 on an unrelated
  // docs-only commit) — 60s gives real API latency room without masking a genuine hang.
  expect: {
    timeout: 60_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: true,
      },
});
