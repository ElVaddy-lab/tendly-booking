import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test("demo roles (Owner / Manager / Staff), Free limits, Telegram lock, hero booking handoff, and nightly cron reset work end-to-end", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);

  const dayOffset = testInfo.project.name === "mobile-chromium" ? 4 : 3;

  // 1. Landing #roles one-click sign-in as Owner
  await page.goto("/", { waitUntil: "networkidle" });
  const rolesSection = page.locator("#roles");
  await expect(rolesSection).toBeVisible();
  await rolesSection.getByRole("button", { name: "Enter demo as Owner" }).click();

  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
  await expect(
    page.getByRole("heading", { level: 1, name: "Northside Barbers" }),
  ).toBeVisible();
  await expect(
    page.getByText("Demo business — fictional · Resets nightly"),
  ).toBeVisible();
  await expect(page.getByText("Signed in as owner@demo.tendly.example")).toBeVisible();

  // Verify Free plan caps at 3/3 staff and 5/5 services and blocks adding a 4th staff member
  const billingSection = page.getByRole("region", { name: "Plan & billing" });
  await expect(billingSection.getByText("Free plan — $0/mo")).toBeVisible();
  await expect(billingSection.getByText("3 / 3")).toBeVisible();
  await expect(billingSection.getByText("5 / 5")).toBeVisible();
  await expect(page.getByRole("region", { name: "Team & invitations" })).toBeVisible();
  await expect(
    billingSection.getByRole("button", { name: /Upgrade to Pro/ }),
  ).toBeVisible();

  const addStaffSection = page.getByRole("region", { name: "Add staff member" });
  await addStaffSection.getByLabel("Display name").fill("Oleg Demo Blocked");
  await addStaffSection.getByRole("button", { name: "Add staff member" }).click();
  await expect(
    addStaffSection
      .getByRole("alert")
      .getByText(/Free plan allows up to 3 active staff members/),
  ).toBeVisible({ timeout: 15_000 });

  // Verify Telegram linking is blocked in demo mode at app + DB trigger level
  const andriyCard = page.getByRole("region", { name: "Andriy" });
  await andriyCard.getByText("Telegram & calendar (.ics)").click();
  await andriyCard.getByRole("button", { name: "Connect Telegram" }).click();
  await expect(
    andriyCard
      .getByRole("alert")
      .getByText("Telegram linking is disabled in the shared demo workspace."),
  ).toBeVisible({ timeout: 15_000 });

  // 2. /demo/manager landing + one-click sign-in + Manager restrictions
  const managerResponse = await page.goto("/demo/manager", { waitUntil: "networkidle" });
  expect(managerResponse?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "Northside Barbers as Manager" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("button", { name: "Enter dashboard as Manager" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
  await expect(page.getByText("Signed in as manager@demo.tendly.example")).toBeVisible();
  await expect(page.getByRole("region", { name: "Add staff member" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Team & invitations" })).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Plan & billing" })
      .getByRole("button", { name: /Upgrade to Pro/ }),
  ).toHaveCount(0);

  // 3. /demo/staff landing + one-click sign-in + Staff restrictions
  const staffResponse = await page.goto("/demo/staff", { waitUntil: "networkidle" });
  expect(staffResponse?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "Northside Barbers as Staff" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("button", { name: "Enter dashboard as Staff" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
  await expect(page.getByText("Signed in as staff@demo.tendly.example")).toBeVisible();
  await expect(page.getByRole("region", { name: "Add staff member" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Add service" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Team & invitations" })).toHaveCount(0);

  // Staff sees Sam's integrations only, not Andriy's, and Telegram connect stays disabled
  await expect(
    page.getByRole("region", { name: "Andriy" }).getByText("Telegram & calendar (.ics)"),
  ).toHaveCount(0);
  const samCard = page.getByRole("region", { name: "Sam" });
  await samCard.getByText("Telegram & calendar (.ics)").click();
  await samCard.getByRole("button", { name: "Connect Telegram" }).click();
  await expect(
    samCard
      .getByRole("alert")
      .getByText("Telegram linking is disabled in the shared demo workspace."),
  ).toBeVisible({ timeout: 15_000 });

  // 4. Hero booking card hands off cleanly to live /b/northside-barbers public booking page
  await page.goto("/", { waitUntil: "networkidle" });
  const heroForm = page.getByRole("form", { name: "Northside Barbers" });
  await heroForm.getByLabel(/Beard trim/).check();
  await heroForm.getByRole("button", { name: /^Book / }).click();

  await expect(page).toHaveURL(/\/b\/northside-barbers$/, { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { level: 1, name: "Northside Barbers" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);

  await page
    .getByRole("radiogroup", { name: "Services" })
    .getByRole("radio", { name: /Haircut/ })
    .check();
  await page.getByRole("radiogroup", { name: "Barber" }).getByRole("radio", { name: /Sam/ }).check();
  await page
    .getByRole("radiogroup", { name: "Date" })
    .locator('label[data-empty="false"] input[type="radio"]')
    .nth(dayOffset)
    .check();
  await page
    .getByRole("radiogroup", { name: "Time" })
    .locator('input[type="radio"]')
    .first()
    .check();
  await page.getByLabel("Your name").fill(`Demo Visitor ${dayOffset}`);
  await page.getByLabel("Email").fill(`demo-visitor-${dayOffset}@example.test`);
  await page.getByRole("button", { name: /Confirm booking/ }).click();
  await expect(
    page.getByRole("heading", { name: /Booking confirmed/ }),
  ).toBeVisible({ timeout: 15_000 });

  // 5. Nightly cron reset endpoint enforces Bearer secret and resets demo data cleanly
  const unauthReset = await page.request.post("/api/cron/demo-reset");
  expect(unauthReset.status()).toBe(401);

  const authReset = await page.request.post("/api/cron/demo-reset", {
    headers: { authorization: "Bearer tendly-local-cron" },
  });
  expect(authReset.status()).toBe(200);
  expect(await authReset.json()).toMatchObject({
    ok: true,
    demoReset: true,
  });
});
