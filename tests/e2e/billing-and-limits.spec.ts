import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import Stripe from "stripe";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const WEBHOOK_SECRET =
  process.env.STRIPE_WEBHOOK_SECRET?.trim() || "whsec_playwright_e2e_test_secret";

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

function signStripeWebhook(payloadObject: Record<string, unknown>) {
  const stripe = new Stripe("sk_test_e2e_signing_only");
  const rawBody = JSON.stringify(payloadObject);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: rawBody,
    secret: WEBHOOK_SECRET,
  });
  return { rawBody, signature };
}

test("Free plan enforces 3 active staff, Checkout redirect never upgrades without verified webhook, signed webhook unlocks Pro (10 staff) and Manage billing, and downgrade restores Free cap", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(240_000);

  const suffix = `${Date.now().toString(36)}-${testInfo.workerIndex}-${Math.random().toString(36).slice(2, 6)}`;
  const ownerEmail = `owner-billing-${suffix}@example.test`;
  const martaEmail = `marta-billing-${suffix}@example.test`;
  const password = "password1234";
  const businessName = `Northside Billing ${suffix}`;
  const slug = `billing-${suffix}`;

  // 1. Owner onboarding (Andriy = active staff #1)
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
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });

  // 2. Add Marta (#2) and Taras (#3), then verify #4 is rejected on Free plan
  const addStaffSection = page.getByRole("region", { name: "Add staff member" });
  await addStaffSection.getByLabel("Display name").fill("Marta");
  await addStaffSection.getByRole("button", { name: "Add staff member" }).click();
  await expect(addStaffSection.getByRole("status").getByText("Added Marta.")).toBeVisible({
    timeout: 15_000,
  });

  await addStaffSection.getByLabel("Display name").fill("Taras");
  await addStaffSection.getByRole("button", { name: "Add staff member" }).click();
  await expect(addStaffSection.getByRole("status").getByText("Added Taras.")).toBeVisible({
    timeout: 15_000,
  });

  await addStaffSection.getByLabel("Display name").fill("Oleg");
  await addStaffSection.getByRole("button", { name: "Add staff member" }).click();
  await expect(
    addStaffSection
      .getByRole("alert")
      .getByText(/Free plan allows up to 3 active staff members/),
  ).toBeVisible({ timeout: 15_000 });

  // Check Free usage in Plan & billing and Axe WCAG 2.2 AA
  const billingSection = page.getByRole("region", { name: "Plan & billing" });
  await expect(billingSection.getByText("Free plan — $0/mo")).toBeVisible();
  await expect(billingSection.getByText("3 / 3")).toBeVisible();
  await expect(billingSection.getByText("1 / 5")).toBeVisible();
  await expectNoA11yViolations(page);

  // Create linked invite for Marta while still Free (works since Marta already exists)
  const inviteSection = page.getByRole("region", { name: "Invite a team member" });
  await inviteSection.getByLabel("Role").selectOption("staff");
  await inviteSection.getByLabel("Staff profile (optional)").selectOption({ label: "Marta" });
  await inviteSection.getByRole("button", { name: "Create invite link" }).click();
  const shareInput = inviteSection.getByLabel("Shareable invite link");
  await expect(shareInput).toBeVisible({ timeout: 15_000 });
  const invitePath = new URL(await shareInput.inputValue()).pathname;

  // 3. Intercept Checkout redirect when Owner clicks "Upgrade to Pro — $19/mo"
  let checkoutTargetUrl = "";
  await page.route("https://checkout.stripe.com/**", async (route) => {
    checkoutTargetUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body><h1>Stripe Checkout Mock</h1></body></html>",
    });
  });

  await billingSection.getByRole("button", { name: "Upgrade to Pro — $19/mo" }).click();
  await page.waitForURL(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_tendly_/, {
    timeout: 15_000,
  });

  const businessId = new URL(checkoutTargetUrl).searchParams.get("client_reference_id");
  expect(businessId).toBeTruthy();

  // 4. Returning to ?billing=success BEFORE webhook MUST NOT upgrade the shop
  await page.goto("/dashboard?billing=success#billing", { waitUntil: "networkidle" });
  await expect(
    billingSection.getByText(
      "Checkout completed — your plan updates automatically once Stripe confirms the payment webhook.",
    ),
  ).toBeVisible();
  await expect(billingSection.getByText("Free plan — $0/mo")).toBeVisible();
  await expect(
    billingSection.getByRole("button", { name: "Upgrade to Pro — $19/mo" }),
  ).toBeVisible();

  // 5. Reject unsigned / bad signature, accept signed webhook idempotently
  const badWebhookResponse = await page.request.post("/api/webhooks/stripe", {
    headers: {
      "content-type": "application/json",
      "stripe-signature": "t=123,v1=invalid",
    },
    data: JSON.stringify({ id: "evt_invalid", type: "checkout.session.completed" }),
  });
  expect(badWebhookResponse.status()).toBe(400);

  const upgradeEventId = `evt_e2e_upgrade_${suffix}`;
  const customerId = `cus_e2e_${suffix}`;
  const subscriptionId = `sub_e2e_${suffix}`;
  const signedUpgrade = signStripeWebhook({
    id: upgradeEventId,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_e2e_${suffix}`,
        object: "checkout.session",
        mode: "subscription",
        customer: customerId,
        subscription: subscriptionId,
        client_reference_id: businessId,
        metadata: { business_id: businessId },
      },
    },
  });

  const upgradeRes = await page.request.post("/api/webhooks/stripe", {
    headers: {
      "content-type": "application/json",
      "stripe-signature": signedUpgrade.signature,
    },
    data: signedUpgrade.rawBody,
  });
  expect(upgradeRes.status()).toBe(200);
  expect(await upgradeRes.json()).toMatchObject({
    received: true,
    businessId,
    planTier: "pro",
    subscriptionStatus: "active",
  });

  // Duplicate event delivery is acknowledged cleanly without reapplying
  const duplicateRes = await page.request.post("/api/webhooks/stripe", {
    headers: {
      "content-type": "application/json",
      "stripe-signature": signedUpgrade.signature,
    },
    data: signedUpgrade.rawBody,
  });
  expect(duplicateRes.status()).toBe(200);
  expect(await duplicateRes.json()).toMatchObject({
    received: true,
    duplicate: true,
  });

  // 6. Reload dashboard -> Pro active, Manage billing visible, 4th staff succeeds!
  await page.goto("/dashboard#billing", { waitUntil: "networkidle" });
  await expect(billingSection.getByText("Pro plan — $19/mo")).toBeVisible();
  await expect(billingSection.getByRole("button", { name: "Manage billing" })).toBeVisible();
  await expect(
    billingSection.getByRole("button", { name: "Upgrade to Pro — $19/mo" }),
  ).toHaveCount(0);

  await addStaffSection.getByLabel("Display name").fill("Oleg");
  await addStaffSection.getByRole("button", { name: "Add staff member" }).click();
  await expect(addStaffSection.getByRole("status").getByText("Added Oleg.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(billingSection.getByText("4 / 10")).toBeVisible();

  let portalTargetUrl = "";
  await page.route("https://billing.stripe.com/**", async (route) => {
    portalTargetUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body><h1>Stripe Portal Mock</h1></body></html>",
    });
  });
  await billingSection.getByRole("button", { name: "Manage billing" }).click();
  await page.waitForURL(/^https:\/\/billing\.stripe\.com\/p\/session\/test_/, {
    timeout: 15_000,
  });
  expect(portalTargetUrl).toMatch(/^https:\/\/billing\.stripe\.com\/p\/session\/test_/);

  // Return to dashboard before staff invite check
  await page.goto("/dashboard", { waitUntil: "networkidle" });

  // 7. Non-owner staff sees Pro usage & read-only note, never Checkout/Portal buttons
  const staffContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const staffPage = await staffContext.newPage();
  try {
    await staffPage.goto(invitePath, { waitUntil: "networkidle" });
    await staffPage.getByRole("link", { name: "Create account to accept" }).click();
    await staffPage.getByLabel("Email").fill(martaEmail);
    await staffPage.getByLabel("Password").fill(password);
    await staffPage.getByRole("button", { name: "Create account" }).click();
    await expect(staffPage).toHaveURL(new RegExp(`${invitePath}$`), { timeout: 15_000 });

    await staffPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(staffPage).toHaveURL(/\/dashboard$/, { timeout: 15_000 });

    const staffBillingSection = staffPage.getByRole("region", { name: "Plan & billing" });
    await expect(staffBillingSection.getByText("Pro plan — $19/mo")).toBeVisible();
    await expect(staffBillingSection.getByText("4 / 10")).toBeVisible();
    await expect(
      staffBillingSection.getByText(
        "Only the shop owner can change the subscription or open the Stripe billing portal.",
      ),
    ).toBeVisible();
    await expect(
      staffBillingSection.getByRole("button", { name: "Upgrade to Pro — $19/mo" }),
    ).toHaveCount(0);
    await expect(
      staffBillingSection.getByRole("button", { name: "Manage billing" }),
    ).toHaveCount(0);
  } finally {
    await staffContext.close();
  }

  // 8. Signed customer.subscription.deleted restores Free plan limits
  const signedCancel = signStripeWebhook({
    id: `evt_e2e_cancel_${suffix}`,
    object: "event",
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: subscriptionId,
        object: "subscription",
        customer: customerId,
        status: "canceled",
        cancel_at_period_end: false,
        metadata: { business_id: businessId },
        items: {
          object: "list",
          data: [],
        },
      },
    },
  });

  const cancelRes = await page.request.post("/api/webhooks/stripe", {
    headers: {
      "content-type": "application/json",
      "stripe-signature": signedCancel.signature,
    },
    data: signedCancel.rawBody,
  });
  expect(cancelRes.status()).toBe(200);
  expect(await cancelRes.json()).toMatchObject({
    received: true,
    planTier: "free",
    subscriptionStatus: "canceled",
  });

  await page.reload({ waitUntil: "networkidle" });
  await expect(billingSection.getByText("Free plan — $0/mo")).toBeVisible();
  await expect(billingSection.getByText("4 / 3")).toBeVisible();

  await addStaffSection.getByLabel("Display name").fill("Dmytro");
  await addStaffSection.getByRole("button", { name: "Add staff member" }).click();
  await expect(
    addStaffSection
      .getByRole("alert")
      .getByText(/Free plan allows up to 3 active staff members/),
  ).toBeVisible({ timeout: 15_000 });
});
