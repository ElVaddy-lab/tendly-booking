import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test("manage booking flow supports rescheduling (adjacent & cross-barber), .ics download, concurrent conflict, cancellation slot release, mobile, and WCAG 2.2 AA", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);

  const suffix = `${Date.now().toString(36)}-${testInfo.workerIndex}-${Math.random().toString(36).slice(2, 6)}`;
  const ownerEmail = `owner-manage-${suffix}@example.test`;
  const password = "password1234";
  const businessName = `Northside Manage ${suffix}`;
  const slug = `manage-${suffix}`;

  // 1. Owner sets up shop with Andriy and Marta both working Mon-Sun
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

  const addStaffSection = page.getByRole("region", { name: "Add staff member" });
  await addStaffSection.getByLabel("Display name").fill("Marta");
  await addStaffSection.getByRole("button", { name: "Add staff member" }).click();
  await expect(addStaffSection.getByRole("status").getByText("Added Marta.")).toBeVisible({
    timeout: 15_000,
  });

  const martaCard = page.getByRole("region", { name: "Marta" });
  await martaCard.getByText("Edit weekly hours").click();
  await martaCard.getByRole("button", { name: "Mon–Fri 09:00–17:00" }).click();
  // Expand Marta to Saturday & Sunday as well so any weekday day index is open
  await martaCard.getByRole("button", { name: "+ Add window" }).click();
  await martaCard.getByRole("button", { name: "+ Add window" }).click();
  await martaCard.getByRole("button", { name: "Save weekly hours" }).click();
  await expect(martaCard.getByRole("status").getByText("Weekly hours saved.")).toBeVisible();

  // 2. Signed-out visitor books Haircut with Andriy >= 3 days out (well before 24h deadline)
  const visitorContext1 = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const visitorPage1 = await visitorContext1.newPage();

  await visitorPage1.goto(`/b/${slug}`, { waitUntil: "networkidle" });
  await visitorPage1
    .getByRole("radiogroup", { name: "Barber" })
    .getByRole("radio", { name: /Andriy/ })
    .check();

  const bookDateGroup = visitorPage1.getByRole("radiogroup", { name: "Date" });
  await bookDateGroup
    .locator('label[data-empty="false"] input[type="radio"]')
    .nth(3)
    .check();

  const bookTimeGroup = visitorPage1.getByRole("radiogroup", { name: "Time" });
  await bookTimeGroup.getByRole("radio").first().check();

  await visitorPage1.getByLabel("Your name").fill("Manage Client");
  await visitorPage1.getByLabel("Email").fill(`manage-client-${suffix}@example.test`);
  await visitorPage1.getByLabel("Notes (optional)").fill("Fade low");
  await visitorPage1.getByRole("button", { name: /Confirm booking/ }).click();

  const ticket = visitorPage1.getByRole("region", {
    name: "Booking confirmation ticket",
  });
  await expect(ticket.getByRole("heading", { name: /Booking confirmed/ })).toBeVisible();
  const manageLink = ticket.getByRole("link", {
    name: /Manage or cancel booking/,
  });
  await expect(manageLink).toHaveAttribute("href", /^\/manage\/[0-9a-f]{64}$/);
  const manageHref = (await manageLink.getAttribute("href"))!;

  // 3. Open /manage/[token], check details, WCAG 2.2 AA, and .ics download
  await manageLink.click();
  await expect(visitorPage1).toHaveURL(manageHref, { timeout: 25_000 });

  const summaryCard = visitorPage1.getByRole("region", { name: "Booking details" });
  await expect(summaryCard.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(summaryCard.getByText("Andriy")).toBeVisible();
  await expect(summaryCard.getByText("Fade low")).toBeVisible();
  await expectNoA11yViolations(visitorPage1);

  const downloadPromise = visitorPage1.waitForEvent("download");
  await summaryCard
    .getByRole("button", { name: "Download .ics calendar file" })
    .click();
  const download = await downloadPromise;
  const icsPath = await download.path();
  const icsBody = (await readFile(icsPath!, "utf-8")).replace(/\r\n /g, "");
  expect(icsBody).toContain(`SUMMARY:Haircut — ${businessName}`);
  expect(icsBody).toContain("DESCRIPTION:Barber: Andriy");

  // 4. Reschedule to adjacent overlapping slot (+15 min, e.g. 09:00 -> 09:15) with Andriy
  const rescheduleCard = visitorPage1.getByRole("region", {
    name: "Reschedule appointment",
  });
  const timeRadios = rescheduleCard
    .getByRole("radiogroup", { name: "Time" })
    .getByRole("radio");
  // Index 0 is Current slot (09:00), index 1 is +15 min overlapping slot (09:15)
  const adjacentSlotLabel = await rescheduleCard
    .getByRole("radiogroup", { name: "Time" })
    .locator("label")
    .nth(1)
    .innerText();
  const adjacentTimeText = adjacentSlotLabel.split("\n")[0].trim();

  await timeRadios.nth(1).check();
  await rescheduleCard.getByRole("button", { name: /Confirm new time/ }).click();

  await expect(summaryCard.getByRole("status")).toContainText(
    `at ${adjacentTimeText}`,
  );
  await expect(
    summaryCard.getByRole("heading", { level: 2 }),
  ).toContainText(`at ${adjacentTimeText}`);

  // 5. Concurrent conflict on reschedule: pick Marta's 10:00 while Visitor 2 books Marta's 10:00 first
  await rescheduleCard
    .getByRole("radiogroup", { name: "Specialist" })
    .getByRole("radio", { name: /Marta/ })
    .check();
  const marta10Radio = rescheduleCard
    .getByRole("radiogroup", { name: "Time" })
    .getByRole("radio", { name: /^10:00/ });
  await expect(marta10Radio).toBeVisible();
  await marta10Radio.check();

  const visitorContext2 = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const visitorPage2 = await visitorContext2.newPage();
  await visitorPage2.goto(`/b/${slug}`, { waitUntil: "networkidle" });
  await visitorPage2
    .getByRole("radiogroup", { name: "Barber" })
    .getByRole("radio", { name: /Marta/ })
    .check();
  await visitorPage2
    .getByRole("radiogroup", { name: "Date" })
    .locator('label[data-empty="false"] input[type="radio"]')
    .nth(3)
    .check();
  await visitorPage2
    .getByRole("radiogroup", { name: "Time" })
    .getByRole("radio", { name: /^10:00/ })
    .check();
  await visitorPage2.getByLabel("Your name").fill("Competitor Client");
  await visitorPage2.getByLabel("Email").fill(`competitor-${suffix}@example.test`);
  await visitorPage2.getByRole("button", { name: /Confirm booking/ }).click();
  await expect(
    visitorPage2.getByRole("heading", { name: /Booking confirmed/ }),
  ).toBeVisible();
  await visitorContext2.close();

  // Now Visitor 1 submits stale Marta 10:00 -> receives slot_unavailable alert
  await rescheduleCard.getByRole("button", { name: /Confirm new time/ }).click();
  await expect(
    rescheduleCard
      .getByRole("alert")
      .filter({ hasText: "That slot was just taken." }),
  ).toHaveText("That slot was just taken. Please pick another time.");

  // Visitor 1 picks Marta at 11:00 and succeeds
  const marta11Radio = rescheduleCard
    .getByRole("radiogroup", { name: "Time" })
    .getByRole("radio", { name: /^11:00/ });
  await marta11Radio.check();
  await rescheduleCard.getByRole("button", { name: /Confirm new time/ }).click();
  await expect(summaryCard.getByRole("status")).toContainText("at 11:00");
  await expect(summaryCard.getByText("Marta")).toBeVisible();

  await visitorContext1.close();

  // 6. Mobile viewport check + cancel booking + verify 11:00 slot released for Marta
  const mobileContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(manageHref, { waitUntil: "networkidle" });

  const hasOverflow = await mobilePage.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasOverflow).toBe(false);
  await expectNoA11yViolations(mobilePage);

  const mobileSummary = mobilePage.getByRole("region", { name: "Booking details" });
  await mobileSummary.getByRole("button", { name: "Cancel appointment" }).click();
  await mobileSummary.getByRole("button", { name: "Yes, cancel booking" }).click();

  await expect(mobileSummary.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(mobileSummary.getByRole("status")).toContainText(
    "Your appointment has been cancelled",
  );
  await expect(
    mobileSummary.getByRole("link", { name: "Book a new appointment" }),
  ).toHaveAttribute("href", `/b/${slug}`);
  await expectNoA11yViolations(mobilePage);

  // Navigate back to shop page and verify Marta 11:00 is available again
  await mobilePage.goto(`/b/${slug}`, { waitUntil: "networkidle" });
  await mobilePage
    .getByRole("radiogroup", { name: "Barber" })
    .getByRole("radio", { name: /Marta/ })
    .check();
  await mobilePage
    .getByRole("radiogroup", { name: "Date" })
    .locator('label[data-empty="false"] input[type="radio"]')
    .nth(3)
    .check();
  await expect(
    mobilePage
      .getByRole("radiogroup", { name: "Time" })
      .getByRole("radio", { name: /^11:00/ }),
  ).toBeVisible();

  await mobileContext.close();
});

test("unknown or malformed manage tokens render unavailable state safely", async ({
  page,
}) => {
  await page.goto(
    "/manage/0000000000000000000000000000000000000000000000000000000000000000",
    { waitUntil: "networkidle" },
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Booking link unavailable" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto("/manage/short-bad", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { level: 1, name: "Booking link unavailable" }),
  ).toBeVisible();
});
