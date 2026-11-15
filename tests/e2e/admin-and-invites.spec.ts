import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test("owner manages services, staff split hours, time off, and invites a staff member with strict role isolation", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const suffix = `${Date.now().toString(36)}-${testInfo.workerIndex}-${Math.random().toString(36).slice(2, 6)}`;
  const ownerEmail = `owner-admin-${suffix}@example.test`;
  const staffEmail = `staff-invite-${suffix}@example.test`;
  const password = "password1234";
  const businessName = `Club ${suffix}`;
  const slug = `club-${suffix}`;

  await page.goto("/sign-up", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Business name").fill(businessName);
  await page.getByLabel("Public booking URL").fill(slug);
  await page.getByLabel("Shop time zone").selectOption("America/New_York");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Open your first chair" }),
  ).toBeVisible();
  await page.getByLabel("Your display name").fill("Marco");
  await page.getByLabel("First service").fill("Classic cut");
  await page.getByLabel("Duration (min)").fill("30");
  await page.getByLabel("Buffer (min)").fill("0");
  await page.getByLabel("Price (USD)").fill("35");
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: businessName })).toBeVisible();
  await expectNoA11yViolations(page);

  const addServiceSection = page.getByRole("region", { name: "Add service" });
  await addServiceSection.getByLabel("Service name").fill("Beard trim");
  await addServiceSection.getByLabel("Duration (min)").fill("20");
  await addServiceSection.getByLabel("Buffer (min)").fill("5");
  await addServiceSection.getByLabel("Price in USD (optional)").fill("22.50");
  await addServiceSection.getByRole("button", { name: "Add service" }).click();
  await expect(
    addServiceSection.getByRole("status").getByText('Added "Beard trim".'),
  ).toBeVisible();
  await expect(page.getByText("Beard trim").first()).toBeVisible();

  await page.getByRole("button", { name: "Pause Beard trim" }).click();
  await expect(page.getByText("Beard trim (inactive)")).toBeVisible();
  await page.getByRole("button", { name: "Activate Beard trim" }).click();
  await expect(page.getByText("Beard trim (inactive)")).toHaveCount(0);

  await addServiceSection.getByLabel("Service name").fill("Quick neck shave");
  await addServiceSection.getByLabel("Duration (min)").fill("15");
  await addServiceSection.getByRole("button", { name: "Add service" }).click();
  await expect(page.getByText("Quick neck shave").first()).toBeVisible();
  await page.getByRole("button", { name: "Delete Quick neck shave" }).click();
  await expect(page.getByText("Quick neck shave", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete Quick neck shave" }),
  ).toHaveCount(0);

  const addStaffSection = page.getByRole("region", { name: "Add staff member" });
  await addStaffSection.getByLabel("Display name").fill("Sam");
  await addStaffSection.getByRole("button", { name: "Add staff member" }).click();
  await expect(addStaffSection.getByRole("status").getByText("Added Sam.")).toBeVisible();

  const samCard = page.getByRole("region", { name: "Sam" });
  await expect(samCard).toBeVisible();
  await samCard.getByText("Edit weekly hours").click();
  await samCard.getByRole("button", { name: "+ Add window" }).click();
  await samCard.getByLabel("Window 1 end time for Sam").fill("13:00");
  await samCard.getByRole("button", { name: "+ Add window" }).click();
  await expectNoA11yViolations(page);
  await samCard.getByRole("button", { name: "Save weekly hours" }).click();

  await expect(samCard.getByRole("status").getByText("Weekly hours saved.")).toBeVisible();
  await expect(samCard.getByText("09:00–13:00")).toBeVisible();
  await expect(samCard.getByText("14:00–18:00")).toBeVisible();
  await expect(samCard.getByLabel("Window 1 end time for Sam")).toHaveValue("13:00");
  await expect(samCard.getByLabel("Window 2 start time for Sam")).toHaveValue("14:00");

  const marcoCard = page.getByRole("region", { name: "Marco" });
  await marcoCard.getByText("Edit weekly hours").click();
  await marcoCard.getByRole("button", { name: "Mon–Fri 09:00–17:00" }).click();
  await marcoCard.getByRole("button", { name: "Save weekly hours" }).click();
  await expect(marcoCard.getByRole("status").getByText("Weekly hours saved.")).toBeVisible();
  await expect(marcoCard.getByLabel("Window 2 day for Marco")).toHaveValue("2");
  await expect(marcoCard.getByLabel("Window 5 day for Marco")).toHaveValue("5");

  const addTimeOffSection = page.getByRole("region", { name: "Add time off" });
  await addTimeOffSection.getByLabel("Staff member").selectOption({ label: "Sam" });
  await addTimeOffSection.getByLabel(/Start \(/).fill("2026-12-20T09:00");
  await addTimeOffSection.getByLabel(/End \(/).fill("2026-12-20T12:00");
  await addTimeOffSection.getByLabel("Reason (optional)").fill("Barber Expo");
  await addTimeOffSection.getByRole("button", { name: "Add time off" }).click();
  await expect(page.getByText("Barber Expo")).toBeVisible();

  const inviteSection = page.getByRole("region", { name: "Invite a team member" });
  await inviteSection.getByLabel("Role").selectOption("staff");
  await inviteSection.getByRole("button", { name: "Create invite link" }).click();
  const shareInput = inviteSection.getByLabel("Shareable invite link");
  await expect(shareInput).toBeVisible();
  const inviteUrl = await shareInput.inputValue();
  const invitePath = new URL(inviteUrl, "http://localhost:3100").pathname;
  expect(invitePath).toMatch(/^\/invite\/.+$/);

  const invitedContext = await browser.newContext();
  const invitedPage = await invitedContext.newPage();

  try {
    await invitedPage.goto(invitePath);
    await expect(
      invitedPage.getByRole("heading", { level: 1, name: businessName }),
    ).toBeVisible();
    await expect(invitedPage).toHaveTitle(/Team invitation/);
    await expectNoA11yViolations(invitedPage);

    await invitedPage.getByRole("link", { name: "Create account to accept" }).click();
    await expect(invitedPage).toHaveURL(/\/sign-up\?next=/);
    await invitedPage.getByLabel("Email").fill(staffEmail);
    await invitedPage.getByLabel("Password").fill(password);
    await invitedPage.getByRole("button", { name: "Create account" }).click();

    await expect(invitedPage).toHaveURL(new RegExp(`${invitePath}$`));
    await expect(
      invitedPage.getByRole("button", { name: "Accept invitation" }),
    ).toBeVisible();
    await expect(invitedPage).toHaveTitle(/Team invitation/);
    await expectNoA11yViolations(invitedPage);

    await invitedPage.getByLabel("Display name on booking schedule").fill("Olena");
    await invitedPage.getByRole("button", { name: "Accept invitation" }).click();

    await expect(invitedPage).toHaveURL(/\/dashboard$/);
    await expect(
      invitedPage.getByRole("heading", { level: 1, name: businessName }),
    ).toBeVisible();
    await expect(invitedPage.getByText("staff", { exact: true }).first()).toBeVisible();
    await expect(invitedPage.getByRole("region", { name: "Olena" })).toBeVisible();
    await expectNoA11yViolations(invitedPage);

    await expect(invitedPage.getByRole("button", { name: "Add service" })).toHaveCount(0);
    await expect(
      invitedPage.getByRole("button", { name: "Add staff member" }),
    ).toHaveCount(0);
    await expect(
      invitedPage.getByRole("button", { name: "Create invite link" }),
    ).toHaveCount(0);
    await expect(invitedPage.getByText("Edit weekly hours")).toHaveCount(0);

    const staffTimeOffSection = invitedPage.getByRole("region", { name: "Add time off" });
    await staffTimeOffSection.getByLabel(/Start \(/).fill("2026-12-22T10:00");
    await staffTimeOffSection.getByLabel(/End \(/).fill("2026-12-22T11:30");
    await staffTimeOffSection.getByLabel("Reason (optional)").fill("Doctor visit");
    await staffTimeOffSection.getByRole("button", { name: "Add time off" }).click();

    await expect(invitedPage.getByText("Doctor visit")).toBeVisible();
    await expect(
      invitedPage.getByRole("button", { name: "Remove time off for Olena" }),
    ).toBeVisible();
    await expect(
      invitedPage.getByRole("button", { name: "Remove time off for Sam" }),
    ).toHaveCount(0);
  } finally {
    await invitedContext.close();
  }
});
