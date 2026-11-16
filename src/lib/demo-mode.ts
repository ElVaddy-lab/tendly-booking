import Stripe from "stripe";

import type { BillingEnv } from "@/lib/stripe-billing";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const DEMO_BUSINESS_ID = "d0000000-0000-4000-8000-000000000001";
export const DEMO_BUSINESS_SLUG = "northside-barbers";
export const DEMO_ROLES = ["owner", "manager", "staff"] as const;

export type DemoRole = (typeof DEMO_ROLES)[number];

export const DEMO_ACCOUNTS: Record<
  DemoRole,
  {
    email: string;
    displayName: string;
    roleLabel: string;
    badge: string;
    description: string;
  }
> = {
  owner: {
    email: "owner@demo.tendly.example",
    displayName: "Andriy",
    roleLabel: "Owner",
    badge: "Full access",
    description: "Billing, settings, services, team invites, and every appointment.",
  },
  manager: {
    email: "manager@demo.tendly.example",
    displayName: "Marta",
    roleLabel: "Manager",
    badge: "Shop ops",
    description: "Services, all staff schedules, time off, and every appointment.",
  },
  staff: {
    email: "staff@demo.tendly.example",
    displayName: "Sam",
    roleLabel: "Staff",
    badge: "Personal chair",
    description: "Own bookings, own schedule, and own time off only.",
  },
};

export function parseDemoRole(raw: unknown): DemoRole | null {
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return (DEMO_ROLES as readonly string[]).includes(normalized)
    ? (normalized as DemoRole)
    : null;
}

export function mapDemoRestrictionError(
  error: { message?: string | null } | null | undefined,
): string | null {
  const message = error?.message ?? "";
  if (message.includes("demo_telegram_disabled")) {
    return "Telegram linking is disabled in the shared demo workspace.";
  }
  if (message.includes("demo_business_immutable")) {
    return "The shared demo shop slug and record cannot be renamed or deleted.";
  }
  if (message.includes("demo_member_immutable")) {
    return "Built-in demo team accounts cannot be removed or changed.";
  }
  if (message.includes("demo_staff_immutable")) {
    return "Built-in demo staff profiles cannot be deleted.";
  }
  if (
    message.includes("demo_credentials_immutable") ||
    message.includes("demo_user_immutable")
  ) {
    return "Demo account credentials cannot be changed.";
  }
  return null;
}

export interface DemoAuthAdminDeps {
  adminSupabase?: {
    auth: {
      admin: {
        generateLink: (params: {
          type: "magiclink";
          email: string;
        }) => Promise<{
          data: { properties?: { hashed_token?: string | null } | null } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
  ssrSupabase?: {
    auth: {
      verifyOtp: (params: {
        token_hash: string;
        type: "magiclink";
      }) => Promise<{
        data: { user: { id: string } | null };
        error: { message?: string } | null;
      }>;
    };
  };
  /** Pause between attempts; injectable so tests do not sleep. */
  wait?: (ms: number) => Promise<void>;
}

const DEMO_SIGN_IN_ATTEMPTS = 3;
const DEMO_SIGN_IN_ERROR = "Could not start demo session right now. Please try again.";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Signs the caller into one of the three shared demo accounts via a server-generated
 * one-time Supabase magiclink OTP token (no password is exposed in client code).
 */
export async function signInAsDemoRole(
  role: DemoRole,
  deps?: DemoAuthAdminDeps,
): Promise<{ ok: true; redirectTo: "/dashboard" } | { ok: false; error: string }> {
  const account = DEMO_ACCOUNTS[role];
  const adminSupabase = deps?.adminSupabase ?? createAdminSupabaseClient();
  const ssrSupabase = deps?.ssrSupabase ?? (await createClient());

  const wait = deps?.wait ?? sleep;

  // Each demo role is one shared Auth user, and a new magic link replaces the
  // previous one-time token. Two visitors entering as the same role at once
  // therefore race: the slower verifyOtp sees "One-time token not found".
  // A fresh link after a short, jittered pause wins that race.
  for (let attempt = 1; attempt <= DEMO_SIGN_IN_ATTEMPTS; attempt += 1) {
    // Fail closed: a public, unauthenticated action must never reset the shared demo.
    // Missing demo accounts are restored only by the CRON_SECRET-protected nightly reset.
    const linkResult = await adminSupabase.auth.admin.generateLink({
      type: "magiclink",
      email: account.email,
    });

    const hashedToken = linkResult.data?.properties?.hashed_token;
    if (linkResult.error || !hashedToken) {
      return { ok: false, error: DEMO_SIGN_IN_ERROR };
    }

    const { data: verifyData, error: verifyError } = await ssrSupabase.auth.verifyOtp({
      token_hash: hashedToken,
      type: "magiclink",
    });

    if (!verifyError && verifyData?.user) {
      return { ok: true, redirectTo: "/dashboard" };
    }

    if (attempt < DEMO_SIGN_IN_ATTEMPTS) {
      await wait(100 + Math.floor(Math.random() * 200));
    }
  }

  return { ok: false, error: DEMO_SIGN_IN_ERROR };
}

export interface DemoResetDeps {
  adminSupabase?: {
    from: (table: "business_subscriptions" | "businesses") => unknown;
    rpc: (fn: "reset_demo_and_expired_data") => PromiseLike<{
      data: unknown;
      error: { message?: string } | null;
    }>;
  };
  stripe?: {
    subscriptions: Pick<Stripe["subscriptions"], "cancel">;
  };
  env?: BillingEnv;
}

type ResetRpcRow = {
  demoReset?: boolean;
  expiredBusinessesDeleted?: number;
  expiredUsersDeleted?: number;
};

/**
 * Cancels active Stripe sandbox subscriptions for the shared demo shop and expired
 * visitor shops (> 24h), then resets the database cleanly via SQL RPC.
 */
export async function resetDemoAndCancelSubscriptions(
  deps?: DemoResetDeps,
): Promise<
  | {
      ok: true;
      canceledSubscriptions: number;
      demoReset: boolean;
      expiredBusinessesDeleted: number;
      expiredUsersDeleted: number;
    }
  | { ok: false; error: string }
> {
  const env = deps?.env ?? process.env;
  const adminSupabase = deps?.adminSupabase ?? createAdminSupabaseClient();

  const expiredTable = adminSupabase.from("businesses") as {
    select(cols: "id"): {
      eq(col: "is_demo", val: false): {
        lt(col: "created_at", iso: string): Promise<{
          data: Array<{ id: string }> | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };

  const subsTable = adminSupabase.from("business_subscriptions") as {
    select(cols: "stripe_subscription_id, business_id"): {
      not(col: "stripe_subscription_id", op: "is", val: null): {
        eq(col: "business_id", id: string): Promise<{
          data: Array<{ stripe_subscription_id: string | null; business_id: string }> | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };

  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: expiredRows } = await expiredTable
    .select("id")
    .eq("is_demo", false)
    .lt("created_at", cutoffIso);

  const targetBusinessIds = Array.from(
    new Set([DEMO_BUSINESS_ID, ...(expiredRows ?? []).map((row) => row.id)]),
  );

  const secretKey = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const stripeClient =
    deps?.stripe ?? (secretKey ? new Stripe(secretKey) : undefined);

  let canceledSubscriptions = 0;
  if (stripeClient) {
    const subIdsToCancel = new Set<string>();
    for (const businessId of targetBusinessIds) {
      const { data: subRows } = await subsTable
        .select("stripe_subscription_id, business_id")
        .not("stripe_subscription_id", "is", null)
        .eq("business_id", businessId);

      for (const row of subRows ?? []) {
        if (row.stripe_subscription_id) {
          subIdsToCancel.add(row.stripe_subscription_id);
        }
      }
    }

    for (const subId of subIdsToCancel) {
      try {
        await stripeClient.subscriptions.cancel(subId);
        canceledSubscriptions += 1;
      } catch {
        // Subscription may already be canceled or removed in Stripe sandbox.
      }
    }
  }

  const { data: resetData, error: resetError } = await adminSupabase.rpc(
    "reset_demo_and_expired_data",
  );

  if (resetError) {
    return {
      ok: false,
      error: "Failed to reset demo and expired workspace data.",
    };
  }

  const parsed = (resetData ?? {}) as ResetRpcRow;
  return {
    ok: true,
    canceledSubscriptions,
    demoReset: Boolean(parsed.demoReset ?? true),
    expiredBusinessesDeleted: parsed.expiredBusinessesDeleted ?? 0,
    expiredUsersDeleted: parsed.expiredUsersDeleted ?? 0,
  };
}
