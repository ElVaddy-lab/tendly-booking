import Stripe from "stripe";

import type { Database } from "@/types/database.generated";

export type BillingEnv = Record<string, string | undefined>;

export const FREE_LIMITS = {
  maxStaff: 3,
  maxServices: 5,
  maxMonthlyBookings: 100,
} as const;

export const PRO_LIMITS = {
  maxStaff: 10,
  maxServices: null,
  maxMonthlyBookings: null,
} as const;

export const PRO_PRICE_USD_DOLLARS = 19;
export const PRO_PRICE_LOOKUP_KEY = "tendly_pro_monthly";

export type PlanTier = Database["public"]["Enums"]["plan_tier"];
export type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];

export interface BusinessPlanUsage {
  planTier: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasStripeCustomer: boolean;
  activeStaffCount: number;
  maxStaff: number;
  activeServicesCount: number;
  maxServices: number | null;
  monthlyBookingsCount: number;
  maxMonthlyBookings: number | null;
}

export interface BillingStripeClient {
  webhooks: Pick<Stripe["webhooks"], "constructEvent">;
  subscriptions?: Pick<Stripe["subscriptions"], "retrieve">;
  checkout?: {
    sessions: Pick<Stripe["checkout"]["sessions"], "create">;
  };
  billingPortal?: {
    sessions: Pick<Stripe["billingPortal"]["sessions"], "create">;
  };
  prices?: Pick<Stripe["prices"], "list">;
}

export interface BillingAdminSupabase {
  from: (relation: "stripe_events" | "business_subscriptions" | "businesses") => unknown;
}

const VALID_SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);

const SUPPORTED_WEBHOOK_EVENTS = new Set([
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

const DEFAULT_STRIPE_KEY_FOR_HMAC = "sk_test_webhook_verify_only";

function isLoopbackHostname(urlStr: string): boolean {
  try {
    const { hostname } = new URL(urlStr);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function canUseLocalBillingFallback(origin: string, env: BillingEnv): boolean {
  return (
    isLoopbackHostname(origin) &&
    !env.VERCEL &&
    !env.VERCEL_ENV &&
    (env.NODE_ENV !== "production" || env.STRIPE_LOOPBACK_TEST_MODE === "1")
  );
}

function getBillingStripeClient(
  stripeOverride: BillingStripeClient | undefined,
  env: BillingEnv,
): BillingStripeClient {
  if (stripeOverride) {
    return stripeOverride;
  }
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  return new Stripe(secretKey || DEFAULT_STRIPE_KEY_FOR_HMAC);
}

function normalizeSubscriptionStatus(status: unknown): SubscriptionStatus {
  if (typeof status === "string" && VALID_SUBSCRIPTION_STATUSES.has(status as SubscriptionStatus)) {
    return status as SubscriptionStatus;
  }
  return "incomplete";
}

function toIsoTimestampFromUnix(unixSeconds: unknown): string | null {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return null;
  }
  return new Date(unixSeconds * 1000).toISOString();
}

export function extractStripeId(
  value: string | { id?: string | null } | null | undefined,
): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "object" && typeof value.id === "string") {
    const trimmed = value.id.trim();
    return trimmed || null;
  }
  return null;
}

export function extractSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const fromParent = extractStripeId(invoice.parent?.subscription_details?.subscription);
  if (fromParent) {
    return fromParent;
  }
  const legacySubscription = (invoice as unknown as { subscription?: string | { id?: string } | null })
    .subscription;
  return extractStripeId(legacySubscription);
}

export function mapStripeSubscriptionToRecord(subscription: Stripe.Subscription): {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string;
  stripePriceId: string | null;
  planTier: PlanTier;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  metadataBusinessId: string | null;
} {
  const firstItem = subscription.items?.data?.[0];
  const rawRecord = subscription as unknown as {
    current_period_start?: unknown;
    current_period_end?: unknown;
  };
  const periodStartUnix = firstItem?.current_period_start ?? rawRecord.current_period_start;
  const periodEndUnix = firstItem?.current_period_end ?? rawRecord.current_period_end;
  const status = normalizeSubscriptionStatus(subscription.status);
  const planTier: PlanTier = status === "active" || status === "trialing" ? "pro" : "free";
  const metadataBusinessId =
    typeof subscription.metadata?.business_id === "string"
      ? subscription.metadata.business_id.trim() || null
      : null;

  return {
    stripeCustomerId: extractStripeId(subscription.customer),
    stripeSubscriptionId: subscription.id,
    stripePriceId: firstItem?.price?.id ?? null,
    planTier,
    status,
    currentPeriodStart: toIsoTimestampFromUnix(periodStartUnix),
    currentPeriodEnd: toIsoTimestampFromUnix(periodEndUnix),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    metadataBusinessId,
  };
}

/**
 * Maps PostgreSQL plan limit trigger errors (`P0001`: `plan_limit_*`) into clear English UX copy.
 */
export function mapPlanLimitError(
  error: { message?: string | null; code?: string | null } | null | undefined,
  context: "staff" | "services" | "bookings",
): string | null {
  const message = error?.message ?? "";
  if (message.includes("plan_limit_staff")) {
    return "Free plan allows up to 3 active staff members (Pro allows up to 10). Upgrade in Plan & billing or archive an unused profile.";
  }
  if (message.includes("plan_limit_services")) {
    return "Free plan allows up to 5 active services. Upgrade to Pro in Plan & billing for unlimited services.";
  }
  if (message.includes("plan_limit_bookings")) {
    return context === "bookings"
      ? "This shop has reached its Free plan limit of 100 bookings for this calendar month."
      : "Monthly booking limit reached for the Free plan (100 bookings per month).";
  }
  return null;
}

type DbQueryError = { code?: string | null; message: string };

type BillingTablesAccess = {
  stripeEvents: {
    insert(row: Database["public"]["Tables"]["stripe_events"]["Insert"]): Promise<{
      error: DbQueryError | null;
    }>;
    update(patch: Database["public"]["Tables"]["stripe_events"]["Update"]): {
      eq(col: "id", value: string): Promise<{ error: DbQueryError | null }>;
    };
    delete(): {
      eq(col: "id", value: string): Promise<{ error: DbQueryError | null }>;
    };
  };
  businessSubscriptions: {
    select(cols: "business_id"): {
      eq(
        col: "stripe_subscription_id" | "stripe_customer_id",
        value: string,
      ): {
        maybeSingle(): Promise<{
          data: { business_id: string } | null;
          error: DbQueryError | null;
        }>;
      };
    };
    upsert(
      row: Database["public"]["Tables"]["business_subscriptions"]["Insert"],
      options: { onConflict: "business_id" },
    ): Promise<{ error: DbQueryError | null }>;
  };
  businesses: {
    select(cols: "id"): {
      eq(col: "id", value: string): {
        maybeSingle(): Promise<{
          data: { id: string } | null;
          error: DbQueryError | null;
        }>;
      };
    };
  };
};

function getBillingTables(adminSupabase: BillingAdminSupabase): BillingTablesAccess {
  return {
    stripeEvents: adminSupabase.from("stripe_events") as BillingTablesAccess["stripeEvents"],
    businessSubscriptions: adminSupabase.from(
      "business_subscriptions",
    ) as BillingTablesAccess["businessSubscriptions"],
    businesses: adminSupabase.from("businesses") as BillingTablesAccess["businesses"],
  };
}

async function resolveBusinessIdForBilling(
  tables: BillingTablesAccess,
  hints: {
    metadataBusinessId: string | null;
    stripeSubscriptionId: string | null;
    stripeCustomerId: string | null;
  },
): Promise<string | null> {
  if (hints.metadataBusinessId) {
    const { data } = await tables.businesses
      .select("id")
      .eq("id", hints.metadataBusinessId)
      .maybeSingle();
    if (data?.id) {
      return data.id;
    }
  }

  if (hints.stripeSubscriptionId) {
    const { data } = await tables.businessSubscriptions
      .select("business_id")
      .eq("stripe_subscription_id", hints.stripeSubscriptionId)
      .maybeSingle();
    if (data?.business_id) {
      return data.business_id;
    }
  }

  if (hints.stripeCustomerId) {
    const { data } = await tables.businessSubscriptions
      .select("business_id")
      .eq("stripe_customer_id", hints.stripeCustomerId)
      .maybeSingle();
    if (data?.business_id) {
      return data.business_id;
    }
  }

  return null;
}

export type WebhookProcessResult =
  | {
      ok: true;
      status: 200;
      duplicate?: true;
      ignored?: "unsupported_event_type" | "missing_subscription" | "unknown_business";
      businessId?: string;
      planTier?: PlanTier;
      subscriptionStatus?: SubscriptionStatus;
    }
  | {
      ok: false;
      status: 400 | 500 | 503;
      error: string;
    };

/**
 * Verifies raw Stripe webhook signature, deduplicates via `stripe_events.id`,
 * retrieves canonical Subscription state from Stripe when API credentials are present,
 * and idempotently upserts `public.business_subscriptions`.
 */
export async function processStripeWebhookEvent(input: {
  rawBody: string;
  signatureHeader: string | null;
  adminSupabase: BillingAdminSupabase;
  stripe?: BillingStripeClient;
  env?: BillingEnv;
}): Promise<WebhookProcessResult> {
  const env = input.env ?? process.env;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";

  if (!webhookSecret) {
    return {
      ok: false,
      status: 503,
      error: "STRIPE_WEBHOOK_SECRET is not configured.",
    };
  }

  const signature = input.signatureHeader?.trim() ?? "";
  if (!signature) {
    return {
      ok: false,
      status: 400,
      error: "Invalid Stripe webhook signature.",
    };
  }

  const stripe = getBillingStripeClient(input.stripe, env);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(input.rawBody, signature, webhookSecret);
  } catch {
    return {
      ok: false,
      status: 400,
      error: "Invalid Stripe webhook signature.",
    };
  }

  if (!SUPPORTED_WEBHOOK_EVENTS.has(event.type)) {
    return { ok: true, status: 200, ignored: "unsupported_event_type" };
  }

  const tables = getBillingTables(input.adminSupabase);
  const { error: insertEventError } = await tables.stripeEvents.insert({
    id: event.id,
    event_type: event.type,
  });

  if (insertEventError) {
    if (insertEventError.code === "23505") {
      return { ok: true, status: 200, duplicate: true };
    }
    return {
      ok: false,
      status: 500,
      error: "Could not record Stripe webhook event.",
    };
  }

  const canRetrieveFromStripeApi = Boolean(
    (env.STRIPE_SECRET_KEY?.trim() || input.stripe) && stripe.subscriptions?.retrieve,
  );

  let subscriptionObject: Stripe.Subscription | null = null;
  let subscriptionId: string | null = null;
  let customerIdHint: string | null = null;
  let businessIdHint: string | null = null;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    subscriptionId = extractStripeId(session.subscription);
    customerIdHint = extractStripeId(session.customer);
    businessIdHint =
      (typeof session.client_reference_id === "string" && session.client_reference_id.trim()) ||
      (typeof session.metadata?.business_id === "string" && session.metadata.business_id.trim()) ||
      null;
  } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    subscriptionId = extractSubscriptionIdFromInvoice(invoice);
    customerIdHint = extractStripeId(invoice.customer);
    const parentMeta = invoice.parent?.subscription_details?.metadata;
    businessIdHint =
      (typeof parentMeta?.business_id === "string" && parentMeta.business_id.trim()) ||
      (typeof invoice.metadata?.business_id === "string" && invoice.metadata.business_id.trim()) ||
      null;
  } else {
    subscriptionObject = event.data.object as Stripe.Subscription;
    subscriptionId = subscriptionObject.id;
    customerIdHint = extractStripeId(subscriptionObject.customer);
    businessIdHint =
      typeof subscriptionObject.metadata?.business_id === "string"
        ? subscriptionObject.metadata.business_id.trim() || null
        : null;
  }

  let canonicalSubscription: Stripe.Subscription | null = null;
  if (subscriptionId) {
    if (event.type === "customer.subscription.deleted" && subscriptionObject) {
      canonicalSubscription = subscriptionObject;
    } else if (canRetrieveFromStripeApi && stripe.subscriptions?.retrieve) {
      try {
        canonicalSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      } catch {
        await tables.stripeEvents.delete().eq("id", event.id);
        return {
          ok: false,
          status: 500,
          error: "Could not retrieve canonical subscription state from Stripe.",
        };
      }
    } else if (subscriptionObject) {
      canonicalSubscription = subscriptionObject;
    } else {
      const nowSec = Math.floor(Date.now() / 1000);
      const localStatus: Stripe.Subscription.Status =
        event.type === "invoice.payment_failed" ? "past_due" : "active";
      canonicalSubscription = {
        id: subscriptionId,
        object: "subscription",
        customer: customerIdHint ?? "cus_test_local",
        status: localStatus,
        cancel_at_period_end: false,
        metadata: businessIdHint ? { business_id: businessIdHint } : {},
        items: {
          object: "list",
          data: [
            {
              id: "si_local_test",
              object: "subscription_item",
              current_period_start: nowSec,
              current_period_end: nowSec + 30 * 24 * 60 * 60,
              price: {
                id: env.STRIPE_PRO_PRICE_ID?.trim() || "price_tendly_pro_local",
                object: "price",
              } as Stripe.Price,
            } as unknown as Stripe.SubscriptionItem,
          ],
          has_more: false,
          url: "/v1/subscription_items",
        },
      } as unknown as Stripe.Subscription;
    }
  }

  if (!canonicalSubscription) {
    return { ok: true, status: 200, ignored: "missing_subscription" };
  }

  const mapped = mapStripeSubscriptionToRecord(canonicalSubscription);
  const resolvedBusinessId = await resolveBusinessIdForBilling(tables, {
    metadataBusinessId: mapped.metadataBusinessId ?? businessIdHint,
    stripeSubscriptionId: mapped.stripeSubscriptionId,
    stripeCustomerId: mapped.stripeCustomerId ?? customerIdHint,
  });

  if (!resolvedBusinessId) {
    return { ok: true, status: 200, ignored: "unknown_business" };
  }

  const { error: upsertError } = await tables.businessSubscriptions.upsert(
    {
      business_id: resolvedBusinessId,
      stripe_customer_id: mapped.stripeCustomerId ?? customerIdHint,
      stripe_subscription_id: mapped.stripeSubscriptionId,
      stripe_price_id: mapped.stripePriceId,
      plan_tier: mapped.planTier,
      status: mapped.status,
      current_period_start: mapped.currentPeriodStart,
      current_period_end: mapped.currentPeriodEnd,
      cancel_at_period_end: mapped.cancelAtPeriodEnd,
    },
    { onConflict: "business_id" },
  );

  if (upsertError) {
    if (upsertError.code === "23503") {
      return { ok: true, status: 200, ignored: "unknown_business" };
    }
    await tables.stripeEvents.delete().eq("id", event.id);
    return {
      ok: false,
      status: 500,
      error: "Could not persist business subscription update.",
    };
  }

  await tables.stripeEvents.update({ business_id: resolvedBusinessId }).eq("id", event.id);

  return {
    ok: true,
    status: 200,
    businessId: resolvedBusinessId,
    planTier: mapped.planTier,
    subscriptionStatus: mapped.status,
  };
}

async function resolveProPriceId(
  stripe: BillingStripeClient,
  env: BillingEnv,
): Promise<string | null> {
  const configured = env.STRIPE_PRO_PRICE_ID?.trim();
  if (configured) {
    return configured;
  }
  if (!stripe.prices?.list) {
    return null;
  }
  const prices = await stripe.prices.list({
    active: true,
    lookup_keys: [PRO_PRICE_LOOKUP_KEY],
    limit: 1,
  });
  return prices.data[0]?.id ?? null;
}

/**
 * Creates a Stripe-hosted Checkout Session URL for upgrading a shop to Tendly Pro ($19/month).
 * Uses a deterministic loopback checkout URL only in local non-production mode without Stripe keys.
 */
export async function createBillingCheckoutSession(input: {
  businessId: string;
  businessName: string;
  ownerEmail: string;
  origin: string;
  stripeCustomerId: string | null;
  stripe?: BillingStripeClient;
  env?: BillingEnv;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const env = input.env ?? process.env;
  const secretKey = env.STRIPE_SECRET_KEY?.trim() ?? "";

  if (!secretKey) {
    if (canUseLocalBillingFallback(input.origin, env)) {
      const slugId = input.businessId.slice(0, 8);
      return {
        ok: true,
        url: `https://checkout.stripe.com/c/pay/cs_test_tendly_${slugId}?client_reference_id=${encodeURIComponent(input.businessId)}`,
      };
    }
    return { ok: false, error: "Stripe billing is not configured yet." };
  }

  const stripe = getBillingStripeClient(input.stripe, env);
  if (!stripe.checkout?.sessions?.create) {
    return { ok: false, error: "Stripe Checkout client is unavailable." };
  }

  const priceId = await resolveProPriceId(stripe, env);
  if (!priceId) {
    return {
      ok: false,
      error: "STRIPE_PRO_PRICE_ID is not configured. Run pnpm stripe:setup first.",
    };
  }

  const baseParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    client_reference_id: input.businessId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${input.origin}/dashboard?billing=success#billing`,
    cancel_url: `${input.origin}/dashboard?billing=cancelled#billing`,
    metadata: { business_id: input.businessId },
    subscription_data: {
      metadata: { business_id: input.businessId },
    },
    ...(input.stripeCustomerId
      ? { customer: input.stripeCustomerId }
      : { customer_email: input.ownerEmail }),
  };

  try {
    const session = await stripe.checkout.sessions.create(baseParams);
    if (!session.url) {
      return { ok: false, error: "Stripe did not return a Checkout URL." };
    }
    return { ok: true, url: session.url };
  } catch {
    return { ok: false, error: "Could not start Stripe Checkout right now." };
  }
}

/**
 * Creates a Stripe Customer Portal Session URL for managing an existing shop subscription.
 */
export async function createBillingPortalSession(input: {
  businessId: string;
  origin: string;
  stripeCustomerId: string | null;
  stripe?: BillingStripeClient;
  env?: BillingEnv;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!input.stripeCustomerId) {
    return {
      ok: false,
      error: "No Stripe billing customer record exists for this shop yet.",
    };
  }

  const env = input.env ?? process.env;
  const secretKey = env.STRIPE_SECRET_KEY?.trim() ?? "";

  if (!secretKey) {
    if (canUseLocalBillingFallback(input.origin, env)) {
      return {
        ok: true,
        url: `https://billing.stripe.com/p/session/test_${input.businessId.slice(0, 8)}`,
      };
    }
    return { ok: false, error: "Stripe billing is not configured yet." };
  }

  const stripe = getBillingStripeClient(input.stripe, env);
  if (!stripe.billingPortal?.sessions?.create) {
    return { ok: false, error: "Stripe billing portal client is unavailable." };
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: input.stripeCustomerId,
      return_url: `${input.origin}/dashboard#billing`,
    });
    return { ok: true, url: session.url };
  } catch {
    return { ok: false, error: "Could not open the Stripe billing portal right now." };
  }
}
