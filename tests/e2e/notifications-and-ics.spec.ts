import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test("staff connects Telegram via bot webhook, drains cron outbox, subscribes to .ics feed with revocation, and enforces staff-only integration access", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(240_000);

  const suffix = `${Date.now().toString(36)}-${testInfo.workerIndex}-${Math.random().toString(36).slice(2, 6)}`;
  const ownerEmail = `owner-notif-${suffix}@example.test`;
  const martaEmail = `marta-notif-${suffix}@example.test`;
  const password = "password1234";
  const businessName = `Northside Alerts ${suffix}`;
  const slug = `alerts-${suffix}`;

  // 1. Owner onboarding (Andriy works Mon–Sun)
  await page.goto("/sign-up", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 15_000 });
  await page.getByLabel("Business name").fill(businessName);
  await page.getByLabel("Public booking URL").fill(slug);
  await page.getByLabel("Shop time zone").selectOption("Europe/Kyiv");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Open your first chair" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Your display name").fill("Andriy");
  await page.getByLabel("First service").fill("Haircut");
  await page.getByLabel("Duration (min)").fill("30");
  await page.getByLabel("Buffer (min)").fill("0");
  await page.getByLabel("Price (USD)").fill("35");
  await page.getByRole("checkbox", { name: "Saturday" }).check();
  await page.getByRole("checkbox", { name: "Sunday" }).check();
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });

  // Add second staff member Marta + invite linked to Marta
  const addStaffSection = page.getByRole("region", { name: "Add staff member" });
  await addStaffSection.getByLabel("Display name").fill("Marta");
  await addStaffSection.getByRole("button", { name: "Add staff member" }).click();
  await expect(addStaffSection.getByRole("status").getByText("Added Marta.")).toBeVisible({
    timeout: 15_000,
  });

  const inviteSection = page.getByRole("region", { name: "Invite a team member" });
  await inviteSection.getByLabel("Role").selectOption("staff");
  await inviteSection.getByLabel("Staff profile (optional)").selectOption({ label: "Marta" });
  await inviteSection.getByRole("button", { name: "Create invite link" }).click();
  const shareInput = inviteSection.getByLabel("Shareable invite link");
  await expect(shareInput).toBeVisible({ timeout: 15_000 });
  const inviteUrl = await shareInput.inputValue();
  const invitePath = new URL(inviteUrl).pathname;

  // 2. Owner generates Telegram /start link code for Andriy & simulates Telegram webhook update
  const andriyCard = page.getByRole("region", { name: "Andriy" });
  await andriyCard.getByText("Telegram & calendar (.ics)").click();
  await andriyCard.getByRole("button", { name: "Connect Telegram" }).click();

  const tgCommandInput = andriyCard.getByLabel("Telegram start command for Andriy");
  await expect(tgCommandInput).toHaveValue(/^\/start [0-9a-f]{32}$/, {
    timeout: 15_000,
  });
  const startCommand = await tgCommandInput.inputValue();

  const webhookResponse = await page.request.post("/api/webhooks/telegram", {
    data: {
      message: {
        text: startCommand,
        chat: { id: 900777888 },
      },
    },
  });
  expect(webhookResponse.status()).toBe(200);
  expect(await webhookResponse.json()).toMatchObject({
    ok: true,
    linked: true,
    staffName: "Andriy",
  });

  await page.reload({ waitUntil: "networkidle" });
  await expect(andriyCard.getByText("Telegram linked", { exact: true })).toBeVisible();

  // 3. Public visitor books with Andriy -> notification outbox row drained by /api/cron/reminders
  const visitorContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const visitorPage = await visitorContext.newPage();
  try {
    await visitorPage.goto(`/b/${slug}`, { waitUntil: "networkidle" });
    await visitorPage
      .getByRole("radiogroup", { name: "Barber" })
      .getByRole("radio", { name: /Andriy/ })
      .check();
    await visitorPage
      .getByRole("radiogroup", { name: "Date" })
      .locator('label[data-empty="false"] input[type="radio"]')
      .nth(2)
      .check();
    await visitorPage
      .getByRole("radiogroup", { name: "Time" })
      .getByRole("radio", { name: /^09:00/ })
      .check();
    await visitorPage.getByLabel("Your name").fill("E2E Alert Client");
    await visitorPage.getByLabel("Email").fill(`alert-guest-${suffix}@example.test`);
    await visitorPage.getByLabel("Notes (optional)").fill("Low fade");
    await visitorPage.getByRole("button", { name: /Confirm booking/ }).click();
    await expect(
      visitorPage.getByRole("heading", { name: /Booking confirmed/ }),
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await visitorContext.close();
  }

  // Verify cron endpoint rejects unauthenticated calls, then drains outbox cleanly with Bearer token
  const unauthorizedCron = await page.request.post("/api/cron/reminders");
  expect(unauthorizedCron.status()).toBe(401);

  const cronResponse = await page.request.post("/api/cron/reminders", {
    headers: { authorization: "Bearer tendly-local-cron" },
  });
  expect(cronResponse.status()).toBe(200);
  const cronJson = (await cronResponse.json()) as {
    ok: boolean;
    sent: number;
    failed: number;
    enqueuedReminders: number;
  };
  expect(cronJson.ok).toBe(true);
  expect(cronJson.sent).toBeGreaterThanOrEqual(1);
  expect(cronJson.failed).toBe(0);
  expect(cronJson.enqueuedReminders).toBeGreaterThanOrEqual(0);

  // 4. Enable .ics feed for Andriy -> verify iCalendar payload -> revoke -> verify 404
  await andriyCard.getByText("Telegram & calendar (.ics)").click();
  await andriyCard.getByRole("button", { name: "Enable .ics feed" }).click();

  const icsInput = andriyCard.getByLabel("Calendar feed URL for Andriy");
  await expect(icsInput).toHaveValue(/\/api\/cal\/[0-9a-f]{64}$/, {
    timeout: 15_000,
  });
  const feedUrl = await icsInput.inputValue();
  const feedPath = new URL(feedUrl).pathname;

  const icsRes = await page.request.get(feedPath);
  expect(icsRes.status()).toBe(200);
  expect(icsRes.headers()["content-type"]).toContain("text/calendar");
  expect(icsRes.headers()["cache-control"]).toContain("no-store");
  const icsBody = (await icsRes.text()).replace(/\r\n /g, "");
  expect(icsBody).toContain("BEGIN:VCALENDAR\r\n");
  expect(icsBody).toContain("X-WR-CALNAME:Andriy");
  expect(icsBody).toContain("SUMMARY:Haircut — E2E Alert Client\r\n");
  expect(icsBody).not.toContain(`alert-guest-${suffix}@example.test`);

  await expectNoA11yViolations(page);

  await andriyCard.getByRole("button", { name: "Revoke .ics" }).click();
  await expect(
    andriyCard.getByRole("status").getByText("Calendar feed revoked."),
  ).toBeVisible({ timeout: 15_000 });

  const revokedRes = await page.request.get(feedPath);
  expect(revokedRes.status()).toBe(404);

  // 5. Marta accepts staff invite -> sees integration panel ONLY on own card, never on Andriy's
  const martaContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const martaPage = await martaContext.newPage();
  try {
    await martaPage.goto(invitePath, { waitUntil: "networkidle" });
    await martaPage.getByRole("link", { name: "Create account to accept" }).click();
    await martaPage.getByLabel("Email").fill(martaEmail);
    await martaPage.getByLabel("Password").fill(password);
    await martaPage.getByRole("button", { name: "Create account" }).click();

    await expect(martaPage).toHaveURL(new RegExp(`${invitePath}$`), { timeout: 15_000 });
    await martaPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(martaPage).toHaveURL(/\/dashboard$/, { timeout: 15_000 });

    const martaOwnCard = martaPage.getByRole("region", { name: "Marta" });
    const martaAndriyCard = martaPage.getByRole("region", { name: "Andriy" });
    await expect(martaOwnCard.getByText("Telegram & calendar (.ics)")).toBeVisible();
    await expect(martaAndriyCard.getByText("Telegram & calendar (.ics)")).toHaveCount(0);

    await martaOwnCard.getByText("Telegram & calendar (.ics)").click();
    await martaOwnCard.getByRole("button", { name: "Enable .ics feed" }).click();
    await expect(martaOwnCard.getByLabel("Calendar feed URL for Marta")).toHaveValue(
      /\/api\/cal\/[0-9a-f]{64}$/,
      { timeout: 15_000 },
    );
    await expectNoA11yViolations(martaPage);
  } finally {
    await martaContext.close();
  }
});
