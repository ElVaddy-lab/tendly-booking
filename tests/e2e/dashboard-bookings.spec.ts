import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test("owner manages Day/Week calendar, manual walk-ins, statuses, and customer data erasure while staff only accesses own schedule", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);

  const suffix = `${Date.now().toString(36)}-${testInfo.workerIndex}-${Math.random().toString(36).slice(2, 6)}`;
  const ownerEmail = `owner-cal-${suffix}@example.test`;
  const martaEmail = `marta-cal-${suffix}@example.test`;
  const password = "password1234";
  const businessName = `Salon Desk ${suffix}`;
  const slug = `desk-${suffix}`;

  // 1. Owner onboarding (Andriy works Mon-Sun 09:00-18:00)
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
  ).toBeVisible();
  await page.getByLabel("Your display name").fill("Andriy");
  await page.getByLabel("First service").fill("Haircut");
  await page.getByLabel("Duration (min)").fill("30");
  await page.getByLabel("Buffer (min)").fill("0");
  await page.getByLabel("Price (USD)").fill("35");
  await page.getByRole("checkbox", { name: "Saturday" }).check();
  await page.getByRole("checkbox", { name: "Sunday" }).check();
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });

  // Add second staff member Marta with Mon-Sun hours + invite linked to Marta
  const addStaffSection = page.getByRole("region", { name: "Add staff member" });
  await addStaffSection.getByLabel("Display name").fill("Marta");
  await addStaffSection.getByRole("button", { name: "Add staff member" }).click();
  await expect(addStaffSection.getByRole("status").getByText("Added Marta.")).toBeVisible({
    timeout: 15_000,
  });

  const martaCard = page.getByRole("region", { name: "Marta" });
  await martaCard.getByText("Edit weekly hours").click();
  await martaCard.getByRole("button", { name: "Mon–Fri 09:00–17:00" }).click();
  await martaCard.getByRole("button", { name: "+ Add window" }).click();
  await martaCard.getByRole("button", { name: "+ Add window" }).click();
  await martaCard.getByRole("button", { name: "Save weekly hours" }).click();
  await expect(martaCard.getByRole("status").getByText("Weekly hours saved.")).toBeVisible({
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

  // 2. Public visitors create one booking with Andriy (09:00) and one with Marta (10:00) on Day +3
  const visitorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const visitorPage = await visitorContext.newPage();

  await visitorPage.goto(`/b/${slug}`, { waitUntil: "networkidle" });
  await visitorPage
    .getByRole("radiogroup", { name: "Barber" })
    .getByRole("radio", { name: /Andriy/ })
    .check();
  const targetDateRadio = visitorPage
    .getByRole("radiogroup", { name: "Date" })
    .locator('label[data-empty="false"] input[type="radio"]')
    .nth(3);
  const targetDateKey = await targetDateRadio.inputValue();
  await targetDateRadio.check();
  await visitorPage
    .getByRole("radiogroup", { name: "Time" })
    .getByRole("radio", { name: /^09:00/ })
    .check();
  await visitorPage.getByLabel("Your name").fill("Public Andriy Guest");
  await visitorPage.getByLabel("Email").fill(`public-andriy-${suffix}@example.test`);
  await visitorPage.getByLabel("Notes (optional)").fill("Scissor trim only");
  await visitorPage.getByRole("button", { name: /Confirm booking/ }).click();
  await expect(
    visitorPage.getByRole("heading", { name: /Booking confirmed/ }),
  ).toBeVisible();

  await visitorPage.getByRole("button", { name: "Book another appointment" }).click();
  await visitorPage
    .getByRole("radiogroup", { name: "Barber" })
    .getByRole("radio", { name: /Marta/ })
    .check();
  await visitorPage
    .getByRole("radiogroup", { name: "Time" })
    .getByRole("radio", { name: /^10:00/ })
    .check();
  await visitorPage.getByLabel("Your name").fill("Public Marta Guest");
  await visitorPage.getByLabel("Email").fill(`public-marta-${suffix}@example.test`);
  await visitorPage.getByLabel("Notes (optional)").fill("Keep top longer");
  await visitorPage.getByRole("button", { name: /Confirm booking/ }).click();
  await expect(
    visitorPage.getByRole("heading", { name: /Booking confirmed/ }),
  ).toBeVisible();
  await visitorContext.close();

  // 3. Owner reloads dashboard, reviews Day & Week grid, creates manual booking + checks overlap
  await page.reload({ waitUntil: "networkidle" });
  const appointmentsList = page.getByRole("region", { name: "Appointments list" });
  await expect(appointmentsList.getByText("Public Andriy Guest")).toBeVisible();
  await expect(appointmentsList.getByText("Public Marta Guest")).toBeVisible();

  await page.getByLabel("Calendar date").fill(targetDateKey);
  const dayGrid = page.getByRole("region", { name: "Day schedule grid" });
  await expect(dayGrid.getByRole("button", { name: /Public Andriy Guest/ })).toBeVisible();
  await expect(dayGrid.getByRole("button", { name: /Public Marta Guest/ })).toBeVisible();

  await page.getByRole("button", { name: "Week", exact: true }).click();
  const weekGrid = page.getByRole("region", { name: "Week schedule grid" });
  await expect(weekGrid.getByRole("button", { name: /Public Andriy Guest/ })).toBeVisible();
  await expect(weekGrid.getByRole("button", { name: /Public Marta Guest/ })).toBeVisible();
  await page.getByRole("button", { name: "Day", exact: true }).click();

  // Create manual walk-in booking for Andriy at 11:00 without email
  const manualCard = page.getByRole("region", { name: "Create manual booking" });
  await manualCard.getByLabel("Specialist").selectOption({ label: "Andriy" });
  await manualCard.getByLabel(/Date/).fill(targetDateKey);
  await manualCard.getByLabel(/Start time/).fill("11:00");
  await manualCard.getByLabel("Client name").fill("Walk-in Desk");
  await manualCard.getByLabel("Notes (optional)").fill("Front desk cut");
  await manualCard.getByRole("button", { name: "Create manual booking" }).click();

  await expect(manualCard.getByRole("status")).toHaveText("Manual booking added.", {
    timeout: 15_000,
  });
  await expect(manualCard.getByLabel("Client self-manage link")).toHaveValue(
    /\/manage\/[0-9a-f]{64}$/,
  );
  await expect(appointmentsList.getByText("Walk-in Desk")).toBeVisible();
  await expect(appointmentsList.getByText("Walk-in (no email)")).toBeVisible();

  // Attempt overlapping manual booking for Andriy at 11:15 -> rejected by DB exclusion constraint
  await manualCard.getByLabel("Specialist").selectOption({ label: "Andriy" });
  await manualCard.getByLabel(/Date/).fill(targetDateKey);
  await manualCard.getByLabel(/Start time/).fill("11:15");
  await manualCard.getByLabel("Client name").fill("Conflict Guest");
  await manualCard.getByRole("button", { name: "Create manual booking" }).click();
  await expect(manualCard.getByRole("alert")).toHaveText(
    "That specialist already has an overlapping booking at that time.",
    { timeout: 15_000 },
  );

  // 4. Status transitions & GDPR customer data erasure
  await appointmentsList
    .getByRole("button", { name: /Complete booking for Walk-in Desk/ })
    .click();
  await expect(appointmentsList.getByRole("status")).toContainText(
    "Appointment marked completed.",
    { timeout: 15_000 },
  );

  await appointmentsList
    .getByRole("button", { name: /No-show booking for Public Andriy Guest/ })
    .click();
  await expect(appointmentsList.getByRole("status")).toContainText(
    "Appointment marked no-show.",
    { timeout: 15_000 },
  );

  await appointmentsList
    .getByRole("button", { name: /Erase client data for Public Andriy Guest/ })
    .click();
  await appointmentsList
    .getByRole("button", { name: /Confirm erase client data for Public Andriy Guest/ })
    .click();
  await expect(appointmentsList.getByRole("status")).toContainText(
    "Client details permanently erased.",
    { timeout: 15_000 },
  );
  await expect(appointmentsList.getByText("Erased customer")).toBeVisible();
  await expect(appointmentsList.getByText("Data erased")).toBeVisible();
  await expect(appointmentsList.getByText("Scissor trim only")).toHaveCount(0);

  await expectNoA11yViolations(page);

  // Check mobile dashboard viewport responsiveness & overflow
  await page.setViewportSize({ width: 375, height: 812 });
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasOverflow).toBe(false);
  await expectNoA11yViolations(page);

  // 5. Marta accepts staff invite and logs into dashboard: sees ONLY her own bookings, never Andriy's
  const martaContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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

    const martaAppointments = martaPage.getByRole("region", {
      name: "Appointments list",
    });
    await expect(martaAppointments.getByText("Public Marta Guest")).toBeVisible();
    await expect(martaAppointments.getByText("Walk-in Desk")).toHaveCount(0);
    await expect(martaAppointments.getByText("Erased customer")).toHaveCount(0);
    await expect(
      martaAppointments.getByRole("button", { name: /Erase client data/ }),
    ).toHaveCount(0);

    // Marta creates a manual booking onto her own schedule and cancels Public Marta Guest
    const martaManual = martaPage.getByRole("region", {
      name: "Create manual booking",
    });
    await expect(martaManual.getByText(/Booking onto your own schedule \(Marta\)/)).toBeVisible();
    await martaManual.getByLabel(/Date/).fill(targetDateKey);
    await martaManual.getByLabel(/Start time/).fill("14:00");
    await martaManual.getByLabel("Client name").fill("Marta Direct");
    await martaManual.getByRole("button", { name: "Create manual booking" }).click();
    await expect(martaManual.getByRole("status")).toHaveText("Manual booking added.");
    await expect(martaAppointments.getByText("Marta Direct")).toBeVisible();

    await martaAppointments
      .getByRole("button", { name: /Cancel Public Marta Guest/ })
      .click();
    await expect(martaAppointments.getByRole("status")).toContainText(
      "Appointment marked cancelled.",
    );
    await expectNoA11yViolations(martaPage);
  } finally {
    await martaContext.close();
  }
});
