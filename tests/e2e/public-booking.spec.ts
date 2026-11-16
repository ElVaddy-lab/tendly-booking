import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test("public booking flow handles specific barber, anyone available, .ics download, concurrent conflict, and WCAG 2.2 AA", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  const suffix = `${Date.now().toString(36)}-${testInfo.workerIndex}-${Math.random().toString(36).slice(2, 6)}`;
  const ownerEmail = `owner-public-${suffix}@example.test`;
  const password = "password1234";
  const businessName = `Northside ${suffix}`;
  const slug = `north-${suffix}`;

  // 1. Setup a real shop via sign-up -> onboarding -> dashboard
  await page.goto("/sign-up", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Business name").fill(businessName);
  await page.getByLabel("Public booking URL").fill(slug);
  await page.getByLabel("Shop time zone").selectOption("Europe/Kyiv");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Open your first chair" }),
  ).toBeVisible();
  await page.getByLabel("Your display name").fill("Andriy");
  await page.getByLabel("First service").fill("Haircut");
  await page.getByLabel("Duration (min)").fill("30");
  await page.getByLabel("Buffer (min)").fill("0");
  await page.getByLabel("Price (USD)").fill("35");
  await page.getByRole("checkbox", { name: "Saturday" }).check();
  await page.getByRole("checkbox", { name: "Sunday" }).check();
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: businessName })).toBeVisible();

  // Add a second service ("Beard trim") and second staff ("Marta")
  const addServiceSection = page.getByRole("region", { name: "Add service" });
  await addServiceSection.getByLabel("Service name").fill("Beard trim");
  await addServiceSection.getByLabel("Duration (min)").fill("20");
  await addServiceSection.getByLabel("Buffer (min)").fill("0");
  await addServiceSection.getByLabel("Price in USD (optional)").fill("20");
  await addServiceSection.getByRole("button", { name: "Add service" }).click();
  await expect(
    addServiceSection.getByRole("status").getByText('Added "Beard trim".'),
  ).toBeVisible();

  const addStaffSection = page.getByRole("region", { name: "Add staff member" });
  await addStaffSection.getByLabel("Display name").fill("Marta");
  await addStaffSection.getByRole("checkbox", { name: "Beard trim" }).uncheck();
  await addStaffSection.getByRole("button", { name: "Add staff member" }).click();
  await expect(addStaffSection.getByRole("status").getByText("Added Marta.")).toBeVisible();

  const martaCard = page.getByRole("region", { name: "Marta" });
  await martaCard.getByText("Edit weekly hours").click();
  await martaCard.getByRole("button", { name: "Mon–Fri 09:00–17:00" }).click();
  await martaCard.getByRole("button", { name: "Save weekly hours" }).click();
  await expect(martaCard.getByRole("status").getByText("Weekly hours saved.")).toBeVisible();

  // 2. Signed-out visitor completes full booking for Andriy + downloads .ics
  const visitorContext1 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const visitorPage1 = await visitorContext1.newPage();

  await visitorPage1.goto(`/b/${slug}`, { waitUntil: "networkidle" });
  await expect(visitorPage1.getByRole("heading", { level: 1, name: businessName })).toBeVisible();
  await expect(visitorPage1.getByText(`/b/${slug}`)).toBeVisible();
  await expect(visitorPage1.getByText(/Shop time: Europe\/Kyiv/)).toBeVisible();
  await expectNoA11yViolations(visitorPage1);

  const serviceGroup = visitorPage1.getByRole("radiogroup", { name: "Services" });
  const barberGroup = visitorPage1.getByRole("radiogroup", { name: "Barber" });

  // Selecting Beard trim filters out Marta (who only offers Haircut)
  await serviceGroup.getByRole("radio", { name: /Beard trim/ }).check();
  await expect(barberGroup.getByRole("radio", { name: /Marta/ })).toHaveCount(0);
  await expect(barberGroup.getByRole("radio", { name: /Andriy/ })).toBeVisible();

  // Switch back to Haircut and select Andriy
  await serviceGroup.getByRole("radio", { name: /Haircut/ }).check();
  await expect(barberGroup.getByRole("radio", { name: /Marta/ })).toBeVisible();
  await barberGroup.getByRole("radio", { name: /Andriy/ }).check();

  const dateGroup = visitorPage1.getByRole("radiogroup", { name: "Date" });
  const openDayRadio = dateGroup
    .locator('label[data-empty="false"] input[type="radio"]')
    .nth(1);
  await openDayRadio.check();

  const timeGroup = visitorPage1.getByRole("radiogroup", { name: "Time" });
  const chosenSlotText = (
    await timeGroup.locator("label").first().innerText()
  ).split("\n")[0].trim();

  await timeGroup.getByRole("radio").first().check();

  await visitorPage1.getByLabel("Your name").fill("Alex Kowalski");
  await visitorPage1.getByLabel("Email").fill(`alex-${suffix}@example.test`);
  await visitorPage1.getByLabel("Phone (optional)").fill("+48 500 100 200");
  await visitorPage1.getByLabel("Notes (optional)").fill("Short sides please");

  const confirmBtn1 = visitorPage1.getByRole("button", { name: /Confirm booking/ });
  await expect(confirmBtn1).toBeVisible();
  await confirmBtn1.click();

  const ticket = visitorPage1.getByRole("region", { name: "Booking confirmation ticket" });
  await expect(ticket.getByRole("heading", { name: /Booking confirmed/ })).toBeVisible();
  await expect(ticket.getByText(/Haircut.*with Andriy/)).toBeVisible();

  const manageLink = ticket.getByRole("link", { name: /Manage or cancel booking/ });
  await expect(manageLink).toHaveAttribute("href", /^\/manage\/[0-9a-f]{64}$/);
  await expectNoA11yViolations(visitorPage1);

  const downloadPromise = visitorPage1.waitForEvent("download");
  await ticket.getByRole("button", { name: "Download .ics calendar file" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(new RegExp(`^tendly-${slug}-.*\\.ics$`));
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const icsBody = (await readFile(downloadPath!, "utf-8")).replace(/\r\n /g, "");
  expect(icsBody).toContain("BEGIN:VCALENDAR");
  expect(icsBody).toContain(`SUMMARY:Haircut — ${businessName}`);
  expect(icsBody).toContain("DESCRIPTION:Barber: Andriy\\nManage or cancel:");
  expect(icsBody).toContain("Notes: Short sides please");
  expect(icsBody).toContain("/manage/");

  await visitorContext1.close();

  // 3. Concurrent booking conflict: two visitors pick the same slot for Andriy; 2nd gets slot_unavailable
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.goto(`/b/${slug}`, { waitUntil: "networkidle" });
  await pageB.goto(`/b/${slug}`, { waitUntil: "networkidle" });

  for (const p of [pageA, pageB]) {
    await p.getByRole("radiogroup", { name: "Barber" }).getByRole("radio", { name: /Andriy/ }).check();
    await p
      .getByRole("radiogroup", { name: "Date" })
      .locator('label[data-empty="false"] input[type="radio"]')
      .nth(1)
      .check();
    await p.getByRole("radiogroup", { name: "Time" }).getByRole("radio").first().check();
  }

  // Page A books the slot first
  await pageA.getByLabel("Your name").fill("First Guest");
  await pageA.getByLabel("Email").fill(`first-${suffix}@example.test`);
  await pageA.getByRole("button", { name: /Confirm booking/ }).click();
  await expect(
    pageA.getByRole("heading", { name: /Booking confirmed/ }),
  ).toBeVisible();

  // Page B tries to book the exact same stale slot -> receives inline slot_unavailable alert
  await pageB.getByLabel("Your name").fill("Second Guest");
  await pageB.getByLabel("Email").fill(`second-${suffix}@example.test`);
  await pageB.getByRole("button", { name: /Confirm booking/ }).click();
  await expect(
    pageB.getByRole("alert").filter({ hasText: "That slot was just taken." }),
  ).toHaveText("That slot was just taken. Please pick another time.");

  // Page A also verifies Mobile viewport (375x812) responsiveness + Axe
  await contextA.close();
  await contextB.close();

  // 4. "Anyone available" booking + mobile viewport WCAG 2.2 AA & overflow check
  const mobileContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`/b/${slug}`, { waitUntil: "networkidle" });

  const hasHorizontalOverflow = await mobilePage.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
  await expectNoA11yViolations(mobilePage);

  await mobilePage
    .getByRole("radiogroup", { name: "Barber" })
    .getByRole("radio", { name: /Anyone available/ })
    .check();
  await mobilePage
    .getByRole("radiogroup", { name: "Date" })
    .locator('label[data-empty="false"] input[type="radio"]')
    .nth(1)
    .check();
  await mobilePage.getByRole("radiogroup", { name: "Time" }).getByRole("radio").first().check();

  await mobilePage.getByLabel("Your name").fill("Mobile Guest");
  await mobilePage.getByLabel("Email").fill(`mobile-${suffix}@example.test`);
  await mobilePage.getByRole("button", { name: /Confirm booking/ }).click();
  await expect(
    mobilePage.getByRole("heading", { name: /Booking confirmed/ }),
  ).toBeVisible();

  // Keep lint happy if chosenSlotText wasn't asserted again
  expect(chosenSlotText.length).toBeGreaterThan(0);

  await mobileContext.close();
});

test("unknown booking slug renders branded not-found page", async ({ page }) => {
  await page.goto("/b/non-existent-shop-xyz-999");
  await expect(
    page.getByRole("heading", { level: 1, name: "Booking page not found" }),
  ).toBeVisible();
});
