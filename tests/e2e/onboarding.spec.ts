import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test("sign-in and sign-up pages pass WCAG 2.2 AA checks", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto("/sign-up");
  await expect(
    page.getByRole("heading", { level: 1, name: "Start your booking page" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
});

test("owner signs up, completes two-step onboarding, reaches dashboard, signs out and signs back in", async ({
  page,
}, testInfo) => {
  const suffix = `${Date.now().toString(36)}-${testInfo.workerIndex}-${Math.random().toString(36).slice(2, 6)}`;
  const email = `owner-${suffix}@example.test`;
  const password = "password1234";
  const businessName = "Kyiv Razor Club";
  const slug = `razor-${suffix}`;

  await page.goto("/sign-up", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Name your booking page" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByLabel("Business name").fill(businessName);
  await expect(page.getByLabel("Public booking URL")).toHaveValue("kyiv-razor-club");
  await page.getByLabel("Public booking URL").fill(slug);
  await page.getByLabel("Shop time zone").selectOption("Europe/Kyiv");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Open your first chair" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByLabel("Your display name").fill("Andriy");
  await page.getByLabel("First service").fill("Skin fade");
  await page.getByLabel("Duration (min)").fill("45");
  await page.getByLabel("Buffer (min)").fill("10");
  await page.getByLabel("Price (USD)").fill("abc");
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page.getByText("Enter a valid price.")).toBeVisible();
  await expect(page.getByLabel("Your display name")).toHaveValue("Andriy");
  await expect(page.getByLabel("First service")).toHaveValue("Skin fade");
  await expect(page.getByLabel("Duration (min)")).toHaveValue("45");
  await expect(page.getByLabel("Buffer (min)")).toHaveValue("10");
  await expect(page.getByLabel("Price (USD)")).toHaveValue("abc");

  await page.getByLabel("Price (USD)").fill("40");
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: businessName })).toBeVisible();
  await expect(page.getByText(`/b/${slug}`).first()).toBeVisible();
  await expect(page.getByText("Andriy").first()).toBeVisible();
  await expect(page.getByText("Skin fade").first()).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.goto("/sign-in", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: businessName })).toBeVisible();
});
