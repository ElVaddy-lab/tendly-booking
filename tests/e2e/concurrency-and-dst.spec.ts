import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test("simultaneous two-tab booking race lets only one tab win, converts slots into visitor DST timezone cleanly, and passes invite WCAG 2.2 AA", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);

  const suffix = `${Date.now().toString(36)}-${testInfo.workerIndex}-${Math.random().toString(36).slice(2, 6)}`;
  const ownerEmail = `owner-race-${suffix}@example.test`;
  const password = "password1234";
  const businessName = `Race Shop ${suffix}`;
  const slug = `race-${suffix}`;

  // 1. Owner creates a Europe/Kyiv shop working Mon–Sun 09:00–18:00
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

  // Create an invite link and audit /invite/[token] WCAG 2.2 AA in an incognito context
  const inviteSection = page.getByRole("region", { name: "Invite a team member" });
  await inviteSection.getByLabel("Role").selectOption("staff");
  await inviteSection.getByRole("button", { name: "Create invite link" }).click();
  const shareInput = inviteSection.getByLabel("Shareable invite link");
  await expect(shareInput).toBeVisible({ timeout: 15_000 });
  const invitePath = new URL(await shareInput.inputValue()).pathname;

  const inviteContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const invitePage = await inviteContext.newPage();
  try {
    await invitePage.goto(invitePath, { waitUntil: "networkidle" });
    await expect(
      invitePage.getByRole("heading", { level: 1, name: new RegExp(businessName) }),
    ).toBeVisible();
    await expectNoA11yViolations(invitePage);
  } finally {
    await inviteContext.close();
  }

  // 2. Two independent visitor tabs in America/New_York timezone pick the exact same Kyiv slot
  const contextA = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    timezoneId: "America/New_York",
  });
  const contextB = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    timezoneId: "America/New_York",
  });

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await Promise.all([
      pageA.goto(`/b/${slug}`, { waitUntil: "networkidle" }),
      pageB.goto(`/b/${slug}`, { waitUntil: "networkidle" }),
    ]);

    for (const tab of [pageA, pageB]) {
      await expect(
        tab.getByText("Shop time: Europe/Kyiv · Shown in your time: America/New_York"),
      ).toBeVisible();
      await tab
        .getByRole("radiogroup", { name: "Barber" })
        .getByRole("radio", { name: /Andriy/ })
        .check();
      await tab
        .getByRole("radiogroup", { name: "Date" })
        .locator('label[data-empty="false"] input[type="radio"]')
        .nth(1)
        .check();
      await tab.getByRole("radiogroup", { name: "Time" }).getByRole("radio").first().check();
    }

    await expectNoA11yViolations(pageA);

    await pageA.getByLabel("Your name").fill("Concurrent Guest A");
    await pageA.getByLabel("Email").fill(`race-a-${suffix}@example.test`);
    await pageB.getByLabel("Your name").fill("Concurrent Guest B");
    await pageB.getByLabel("Email").fill(`race-b-${suffix}@example.test`);

    // Race both Confirm clicks simultaneously so PostgreSQL exclusion constraint decides winner
    await Promise.all([
      pageA.getByRole("button", { name: /Confirm booking/ }).click(),
      pageB.getByRole("button", { name: /Confirm booking/ }).click(),
    ]);

    // Wait for both tabs to settle: strictly 1 confirmation ticket & strictly 1 slot_unavailable alert
    const settled = await Promise.all([
      Promise.race([
        pageA
          .getByRole("heading", { name: /Booking confirmed/ })
          .waitFor({ timeout: 20_000 })
          .then(() => "confirmed" as const),
        pageA
          .getByRole("alert")
          .filter({ hasText: "That slot was just taken. Please pick another time." })
          .waitFor({ timeout: 20_000 })
          .then(() => "conflict" as const),
      ]),
      Promise.race([
        pageB
          .getByRole("heading", { name: /Booking confirmed/ })
          .waitFor({ timeout: 20_000 })
          .then(() => "confirmed" as const),
        pageB
          .getByRole("alert")
          .filter({ hasText: "That slot was just taken. Please pick another time." })
          .waitFor({ timeout: 20_000 })
          .then(() => "conflict" as const),
      ]),
    ]);

    expect([...settled].sort()).toEqual(["confirmed", "conflict"]);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
