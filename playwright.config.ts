import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const useDevServer = process.env.PLAYWRIGHT_DEV === "1";
const liveApis = process.env.PLAYWRIGHT_LIVE_APIS === "1";
const stripeWebhookSecret = liveApis
  ? process.env.STRIPE_WEBHOOK_SECRET?.trim() || "whsec_playwright_e2e_test_secret"
  : "whsec_playwright_e2e_test_secret";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html"], ["github"]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER
    ? undefined
    : {
        command: useDevServer ? "pnpm dev" : "pnpm build && pnpm start",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          ...process.env,
          ...(liveApis
            ? {}
            : {
                STRIPE_SECRET_KEY: "",
                STRIPE_PRO_PRICE_ID: "",
                TELEGRAM_BOT_TOKEN: "",
                CRON_SECRET: "",
              }),
          STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
          STRIPE_LOOPBACK_TEST_MODE: "1",
        },
      },
});
