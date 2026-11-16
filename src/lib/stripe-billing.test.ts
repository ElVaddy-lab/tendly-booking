import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import {
  createBillingCheckoutSession,
  createBillingPortalSession,
  mapPlanLimitError,
  processStripeWebhookEvent,
  type BillingStripeClient,
} from "./stripe-billing";

const WEBHOOK_SECRET = "whsec_unit_test_secret_1234567890";
const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";

type SubscriptionRow = {
  business_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  plan_tier: "free" | "pro";
  status:
    | "incomplete"
    | "incomplete_expired"
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "paused";
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

function makeSignedWebhook(payloadObject: Record<string, unknown>, secret = WEBHOOK_SECRET) {
  const stripe = new Stripe("sk_test_signing_only");
  const rawBody = JSON.stringify(payloadObject);
  const signatureHeader = stripe.webhooks.generateTestHeaderString({
    payload: rawBody,
    secret,
  });
  return { rawBody, signatureHeader };
}

function makeStripeSubscription(overrides: Partial<{
  id: string;
  customer: string;
  status: Stripe.Subscription.Status;
  priceId: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  metadata: Record<string, string>;
}> = {}): Stripe.Subscription {
  const periodStart = overrides.currentPeriodStart ?? 1_760_000_000;
  const periodEnd = overrides.currentPeriodEnd ?? 1_762_592_000;
  return {
    id: overrides.id ?? "sub_test_123",
    object: "subscription",
    customer: overrides.customer ?? "cus_test_123",
    status: overrides.status ?? "active",
    cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
    metadata: overrides.metadata ?? { business_id: BUSINESS_ID },
    items: {
      object: "list",
      data: [
        {
          id: "si_test_1",
          object: "subscription_item",
          current_period_start: periodStart,
          current_period_end: periodEnd,
          price: {
            id: overrides.priceId ?? "price_pro_monthly",
            object: "price",
          } as Stripe.Price,
        } as unknown as Stripe.SubscriptionItem,
      ],
      has_more: false,
      url: "/v1/subscription_items",
    },
  } as unknown as Stripe.Subscription;
}

function createFakeAdminSupabase(options: {
  initialSubscriptions?: SubscriptionRow[];
  existingEventIds?: string[];
  knownBusinessIds?: string[];
} = {}) {
  const events = new Map<string, { id: string; event_type: string; business_id: string | null }>();
  for (const id of options.existingEventIds ?? []) {
    events.set(id, { id, event_type: "existing", business_id: BUSINESS_ID });
  }

  const subscriptions = new Map<string, SubscriptionRow>();
  for (const row of options.initialSubscriptions ?? []) {
    subscriptions.set(row.business_id, { ...row });
  }

  const knownBusinesses = new Set(options.knownBusinessIds ?? [BUSINESS_ID]);

  const from = vi.fn((table: string) => {
    if (table === "stripe_events") {
      return {
        insert: vi.fn(async (row: { id: string; event_type: string }) => {
          if (events.has(row.id)) {
            return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          }
          events.set(row.id, { id: row.id, event_type: row.event_type, business_id: null });
          return { error: null };
        }),
        update: vi.fn((patch: { business_id: string | null }) => ({
          eq: vi.fn(async (_col: string, id: string) => {
            const existing = events.get(id);
            if (existing) {
              existing.business_id = patch.business_id;
            }
            return { error: null };
          }),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(async (_col: string, id: string) => {
            events.delete(id);
            return { error: null };
          }),
        })),
      };
    }

    if (table === "business_subscriptions") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((col: keyof SubscriptionRow, value: string) => ({
            maybeSingle: vi.fn(async () => {
              const match = [...subscriptions.values()].find((row) => row[col] === value) ?? null;
              return { data: match ? { business_id: match.business_id } : null, error: null };
            }),
          })),
        })),
        upsert: vi.fn(async (row: SubscriptionRow) => {
          if (!knownBusinesses.has(row.business_id)) {
            return {
              error: {
                code: "23503",
                message: 'insert or update on table "business_subscriptions" violates foreign key constraint',
              },
            };
          }
          subscriptions.set(row.business_id, { ...row });
          return { error: null };
        }),
      };
    }

    if (table === "businesses") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((_col: string, id: string) => ({
            maybeSingle: vi.fn(async () => ({
              data: knownBusinesses.has(id) ? { id } : null,
              error: null,
            })),
          })),
        })),
      };
    }

    throw new Error(`Unexpected table lookup in test: ${table}`);
  });

  return {
    client: { from },
    events,
    subscriptions,
  };
}

describe("processStripeWebhookEvent", () => {
  it("returns 400 and touches zero DB tables when signature is invalid or missing", async () => {
    const db = createFakeAdminSupabase();
    const retrieve = vi.fn();
    const result = await processStripeWebhookEvent({
      rawBody: JSON.stringify({ id: "evt_bad", type: "checkout.session.completed", data: { object: {} } }),
      signatureHeader: "t=123,v1=deadbeef",
      adminSupabase: db.client,
      stripe: {
        webhooks: new Stripe("sk_test_verify").webhooks,
        subscriptions: { retrieve },
      } as unknown as BillingStripeClient,
      env: { NODE_ENV: "production", STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_SECRET_KEY: "sk_test_1" },
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Invalid Stripe webhook signature.",
    });
    expect(db.client.from).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("returns 503 when STRIPE_WEBHOOK_SECRET is not configured", async () => {
    const db = createFakeAdminSupabase();
    const result = await processStripeWebhookEvent({
      rawBody: "{}",
      signatureHeader: "t=1,v1=abc",
      adminSupabase: db.client,
      env: { NODE_ENV: "test" },
    });

    expect(result).toEqual({
      ok: false,
      status: 503,
      error: "STRIPE_WEBHOOK_SECRET is not configured.",
    });
    expect(db.client.from).not.toHaveBeenCalled();
  });

  it("deduplicates repeated event.id deliveries with 200 without calling subscriptions.retrieve", async () => {
    const db = createFakeAdminSupabase({ existingEventIds: ["evt_dup_1"] });
    const retrieve = vi.fn();
    const { rawBody, signatureHeader } = makeSignedWebhook({
      id: "evt_dup_1",
      type: "customer.subscription.updated",
      data: { object: makeStripeSubscription() },
    });

    const result = await processStripeWebhookEvent({
      rawBody,
      signatureHeader,
      adminSupabase: db.client,
      stripe: {
        webhooks: new Stripe("sk_test_verify").webhooks,
        subscriptions: { retrieve },
      } as unknown as BillingStripeClient,
      env: { NODE_ENV: "test", STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_SECRET_KEY: "sk_test_1" },
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      duplicate: true,
    });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("uses canonical subscriptions.retrieve so out-of-order updated events cannot resurrect a canceled plan", async () => {
    const db = createFakeAdminSupabase({
      initialSubscriptions: [
        {
          business_id: BUSINESS_ID,
          stripe_customer_id: "cus_test_123",
          stripe_subscription_id: "sub_test_123",
          stripe_price_id: "price_pro_monthly",
          plan_tier: "free",
          status: "canceled",
          current_period_start: null,
          current_period_end: null,
          cancel_at_period_end: false,
        },
      ],
    });
    const stalePayloadSub = makeStripeSubscription({ status: "active" });
    const canonicalCanceledSub = makeStripeSubscription({ status: "canceled" });
    const retrieve = vi.fn().mockResolvedValue(canonicalCanceledSub);

    const { rawBody, signatureHeader } = makeSignedWebhook({
      id: "evt_out_of_order_1",
      type: "customer.subscription.updated",
      data: { object: stalePayloadSub },
    });

    const result = await processStripeWebhookEvent({
      rawBody,
      signatureHeader,
      adminSupabase: db.client,
      stripe: {
        webhooks: new Stripe("sk_test_verify").webhooks,
        subscriptions: { retrieve },
      } as unknown as BillingStripeClient,
      env: { NODE_ENV: "test", STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_SECRET_KEY: "sk_test_1" },
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      businessId: BUSINESS_ID,
      planTier: "free",
      subscriptionStatus: "canceled",
    });
    expect(retrieve).toHaveBeenCalledWith("sub_test_123");
    expect(db.subscriptions.get(BUSINESS_ID)).toMatchObject({
      plan_tier: "free",
      status: "canceled",
    });
  });

  it("ignores events whose business cannot be matched to any local business", async () => {
    const db = createFakeAdminSupabase({ knownBusinessIds: [BUSINESS_ID] });
    const unknownSub = makeStripeSubscription({
      id: "sub_unknown",
      customer: "cus_unknown",
      metadata: { business_id: "99999999-9999-4999-8999-999999999999" },
    });
    const retrieve = vi.fn().mockResolvedValue(unknownSub);

    const { rawBody, signatureHeader } = makeSignedWebhook({
      id: "evt_unknown_biz",
      type: "customer.subscription.updated",
      data: { object: unknownSub },
    });

    const result = await processStripeWebhookEvent({
      rawBody,
      signatureHeader,
      adminSupabase: db.client,
      stripe: {
        webhooks: new Stripe("sk_test_verify").webhooks,
        subscriptions: { retrieve },
      } as unknown as BillingStripeClient,
      env: { NODE_ENV: "test", STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_SECRET_KEY: "sk_test_1" },
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      ignored: "unknown_business",
    });
    expect(db.subscriptions.size).toBe(0);
  });

  it("handles full subscription lifecycle: checkout.session.completed -> invoice.paid -> invoice.payment_failed -> customer.subscription.deleted", async () => {
    const db = createFakeAdminSupabase();
    let currentRemoteSub = makeStripeSubscription({ status: "active" });
    const retrieve = vi.fn(async () => currentRemoteSub);
    const stripeMock = {
      webhooks: new Stripe("sk_test_verify").webhooks,
      subscriptions: { retrieve },
    } as unknown as BillingStripeClient;
    const env = {
      NODE_ENV: "test",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      STRIPE_SECRET_KEY: "sk_test_1",
    };

    // 1. checkout.session.completed -> upgrades to Pro active
    const checkoutWebhook = makeSignedWebhook({
      id: "evt_life_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_1",
          mode: "subscription",
          customer: "cus_test_123",
          subscription: "sub_test_123",
          client_reference_id: BUSINESS_ID,
          metadata: { business_id: BUSINESS_ID },
        },
      },
    });
    const r1 = await processStripeWebhookEvent({
      ...checkoutWebhook,
      adminSupabase: db.client,
      stripe: stripeMock,
      env,
    });
    expect(r1).toMatchObject({ ok: true, planTier: "pro", subscriptionStatus: "active" });
    expect(db.subscriptions.get(BUSINESS_ID)).toMatchObject({
      plan_tier: "pro",
      status: "active",
      stripe_customer_id: "cus_test_123",
      stripe_subscription_id: "sub_test_123",
    });

    // 2. invoice.paid (using Stripe v23 invoice.parent.subscription_details.subscription)
    currentRemoteSub = makeStripeSubscription({
      status: "active",
      currentPeriodEnd: 1_765_000_000,
    });
    const invoicePaidWebhook = makeSignedWebhook({
      id: "evt_life_2",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_paid_1",
          customer: "cus_test_123",
          parent: {
            subscription_details: {
              subscription: "sub_test_123",
              metadata: { business_id: BUSINESS_ID },
            },
          },
        },
      },
    });
    const r2 = await processStripeWebhookEvent({
      ...invoicePaidWebhook,
      adminSupabase: db.client,
      stripe: stripeMock,
      env,
    });
    expect(r2).toMatchObject({ ok: true, planTier: "pro", subscriptionStatus: "active" });

    // 3. invoice.payment_failed -> status past_due, effective tier Free
    currentRemoteSub = makeStripeSubscription({ status: "past_due" });
    const invoiceFailedWebhook = makeSignedWebhook({
      id: "evt_life_3",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_fail_1",
          customer: "cus_test_123",
          parent: {
            subscription_details: {
              subscription: "sub_test_123",
            },
          },
        },
      },
    });
    const r3 = await processStripeWebhookEvent({
      ...invoiceFailedWebhook,
      adminSupabase: db.client,
      stripe: stripeMock,
      env,
    });
    expect(r3).toMatchObject({ ok: true, planTier: "free", subscriptionStatus: "past_due" });

    // 4. customer.subscription.deleted -> canceled, Free limits restored
    const deletedSub = makeStripeSubscription({ status: "canceled" });
    const deletedWebhook = makeSignedWebhook({
      id: "evt_life_4",
      type: "customer.subscription.deleted",
      data: { object: deletedSub },
    });
    const r4 = await processStripeWebhookEvent({
      ...deletedWebhook,
      adminSupabase: db.client,
      stripe: stripeMock,
      env,
    });
    expect(r4).toMatchObject({ ok: true, planTier: "free", subscriptionStatus: "canceled" });
  });
});

describe("createBillingCheckoutSession & createBillingPortalSession", () => {
  it("creates a real Stripe Checkout session when STRIPE_SECRET_KEY & STRIPE_PRO_PRICE_ID exist", async () => {
    const createCheckout = vi.fn().mockResolvedValue({
      id: "cs_live_1",
      url: "https://checkout.stripe.com/c/pay/cs_live_1",
    });

    const result = await createBillingCheckoutSession({
      businessId: BUSINESS_ID,
      businessName: "Northside Barbers",
      ownerEmail: "owner@example.test",
      origin: "https://tendly.app",
      stripeCustomerId: null,
      stripe: {
        checkout: { sessions: { create: createCheckout } },
      } as unknown as BillingStripeClient,
      env: {
        NODE_ENV: "production",
        STRIPE_SECRET_KEY: "sk_live_or_test",
        STRIPE_PRO_PRICE_ID: "price_pro_19usd",
      },
    });

    expect(result).toEqual({
      ok: true,
      url: "https://checkout.stripe.com/c/pay/cs_live_1",
    });
    expect(createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        client_reference_id: BUSINESS_ID,
        customer_email: "owner@example.test",
        line_items: [{ price: "price_pro_19usd", quantity: 1 }],
        success_url: "https://tendly.app/dashboard?billing=success#billing",
        cancel_url: "https://tendly.app/dashboard?billing=cancelled#billing",
        metadata: { business_id: BUSINESS_ID },
        subscription_data: { metadata: { business_id: BUSINESS_ID } },
      }),
    );
  });

  it("uses deterministic loopback Checkout & Portal URLs in local non-prod when STRIPE_SECRET_KEY is unset", async () => {
    const checkoutResult = await createBillingCheckoutSession({
      businessId: BUSINESS_ID,
      businessName: "Northside Barbers",
      ownerEmail: "owner@example.test",
      origin: "http://127.0.0.1:3000",
      stripeCustomerId: null,
      env: { NODE_ENV: "test" },
    });
    expect(checkoutResult).toEqual({
      ok: true,
      url: `https://checkout.stripe.com/c/pay/cs_test_tendly_${BUSINESS_ID.slice(0, 8)}?client_reference_id=${BUSINESS_ID}`,
    });

    const portalResult = await createBillingPortalSession({
      businessId: BUSINESS_ID,
      origin: "http://localhost:3000",
      stripeCustomerId: "cus_test_123",
      env: { NODE_ENV: "test" },
    });
    expect(portalResult).toEqual({
      ok: true,
      url: `https://billing.stripe.com/p/session/test_${BUSINESS_ID.slice(0, 8)}`,
    });
  });

  it("rejects Checkout in production without explicit loopback test opt-in and rejects Portal without stripeCustomerId", async () => {
    const prodCheckout = await createBillingCheckoutSession({
      businessId: BUSINESS_ID,
      businessName: "Northside Barbers",
      ownerEmail: "owner@example.test",
      origin: "https://tendly.app",
      stripeCustomerId: null,
      env: { NODE_ENV: "production", STRIPE_LOOPBACK_TEST_MODE: "1" },
    });
    expect(prodCheckout).toEqual({
      ok: false,
      error: "Stripe billing is not configured yet.",
    });

    const prodLocalWithoutFlag = await createBillingCheckoutSession({
      businessId: BUSINESS_ID,
      businessName: "Northside Barbers",
      ownerEmail: "owner@example.test",
      origin: "http://localhost:3000",
      stripeCustomerId: null,
      env: { NODE_ENV: "production" },
    });
    expect(prodLocalWithoutFlag).toEqual({
      ok: false,
      error: "Stripe billing is not configured yet.",
    });

    const prodVercelLocal = await createBillingCheckoutSession({
      businessId: BUSINESS_ID,
      businessName: "Northside Barbers",
      ownerEmail: "owner@example.test",
      origin: "http://localhost:3000",
      stripeCustomerId: null,
      env: { NODE_ENV: "production", VERCEL: "1", STRIPE_LOOPBACK_TEST_MODE: "1" },
    });
    expect(prodVercelLocal).toEqual({
      ok: false,
      error: "Stripe billing is not configured yet.",
    });

    const prodWithLoopbackOptIn = await createBillingCheckoutSession({
      businessId: BUSINESS_ID,
      businessName: "Northside Barbers",
      ownerEmail: "owner@example.test",
      origin: "http://localhost:3000",
      stripeCustomerId: null,
      env: { NODE_ENV: "production", STRIPE_LOOPBACK_TEST_MODE: "1" },
    });
    expect(prodWithLoopbackOptIn).toEqual({
      ok: true,
      url: `https://checkout.stripe.com/c/pay/cs_test_tendly_${BUSINESS_ID.slice(0, 8)}?client_reference_id=${BUSINESS_ID}`,
    });

    const missingCustomerPortal = await createBillingPortalSession({
      businessId: BUSINESS_ID,
      origin: "http://localhost:3000",
      stripeCustomerId: null,
      env: { NODE_ENV: "test" },
    });
    expect(missingCustomerPortal).toEqual({
      ok: false,
      error: "No Stripe billing customer record exists for this shop yet.",
    });
  });
});

describe("mapPlanLimitError", () => {
  it("maps DB P0001 plan limit error codes to clear English upgrade copy", () => {
    expect(mapPlanLimitError({ message: "plan_limit_staff" }, "staff")).toContain("3");
    expect(mapPlanLimitError({ message: "plan_limit_services" }, "services")).toContain("5");
    expect(mapPlanLimitError({ message: "plan_limit_bookings" }, "bookings")).toContain("100");
    expect(mapPlanLimitError({ message: "other_error" }, "staff")).toBeNull();
  });
});
