import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("landing renders and has no WCAG 2.2 AA violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Keep every chair");
  await expect(page.getByRole("form", { name: "Northside Barbers" })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("booking card asks for a service before booking", async ({ page }) => {
  // The card is a client component; wait for hydration before using it.
  await page.goto("/", { waitUntil: "networkidle" });
  const card = page.getByRole("form", { name: "Northside Barbers" });
  await card.getByRole("button", { name: "Book 10:30" }).click();
  await expect(card.getByRole("status")).toHaveText("Choose a service first.");

  await card.getByRole("radio", { name: /Haircut/ }).check();
  await card.getByRole("radio", { name: "11:30" }).check();
  await expect(card.getByRole("button", { name: "Book 11:30" })).toBeVisible();
});

test("signed-out visitor is redirected from the dashboard to sign-in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in$/);
});
