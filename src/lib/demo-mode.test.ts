import { describe, expect, it, vi } from "vitest";

import {
  DEMO_ACCOUNTS,
  DEMO_BUSINESS_ID,
  DEMO_BUSINESS_SLUG,
  mapDemoRestrictionError,
  parseDemoRole,
  resetDemoAndCancelSubscriptions,
  signInAsDemoRole,
} from "./demo-mode";

describe("parseDemoRole & DEMO_ACCOUNTS", () => {
  it("parses valid demo roles case-insensitively and rejects unknown values", () => {
    expect(parseDemoRole("owner")).toBe("owner");
    expect(parseDemoRole(" Manager ")).toBe("manager");
    expect(parseDemoRole("STAFF")).toBe("staff");
    expect(parseDemoRole("admin")).toBeNull();
    expect(parseDemoRole(null)).toBeNull();
    expect(DEMO_ACCOUNTS.owner.email).toBe("owner@demo.tendly.example");
    expect(DEMO_BUSINESS_SLUG).toBe("northside-barbers");
    expect(DEMO_BUSINESS_ID).toBe("d0000000-0000-4000-8000-000000000001");
  });
});

describe("signInAsDemoRole", () => {
  it("generates a magiclink hashed token via admin auth and verifies OTP into SSR session", async () => {
    const generateLink = vi.fn().mockResolvedValue({
      data: { properties: { hashed_token: "hash_demo_123" } },
      error: null,
    });
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { user: { id: "d0000000-0000-4000-8000-000000000012" } },
      error: null,
    });

    const result = await signInAsDemoRole("manager", {
      adminSupabase: {
        auth: { admin: { generateLink } },
        rpc: vi.fn(),
      },
      ssrSupabase: {
        auth: { verifyOtp },
      },
    });

    expect(result).toEqual({ ok: true, redirectTo: "/dashboard" });
    expect(generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "manager@demo.tendly.example",
    });
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "hash_demo_123",
      type: "magiclink",
    });
  });

  it("returns error when OTP verification fails without throwing raw internals", async () => {
    const generateLink = vi.fn().mockResolvedValue({
      data: { properties: { hashed_token: "hash_demo_123" } },
      error: null,
    });
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid token" },
    });

    const result = await signInAsDemoRole("owner", {
      adminSupabase: {
        auth: { admin: { generateLink } },
        rpc: vi.fn(),
      },
      ssrSupabase: {
        auth: { verifyOtp },
      },
    });

    expect(result).toEqual({
      ok: false,
      error: "Could not start demo session right now. Please try again.",
    });
  });
});

describe("resetDemoAndCancelSubscriptions", () => {
  it("cancels active Stripe sandbox subscriptions on demo and >24h expired businesses before invoking SQL reset", async () => {
    const cancel = vi.fn().mockResolvedValue({ id: "sub_canceled", status: "canceled" });
    const rpc = vi.fn().mockResolvedValue({
      data: { demoReset: true, expiredBusinessesDeleted: 2, expiredUsersDeleted: 1 },
      error: null,
    });

    const from = vi.fn((table: string) => {
      if (table === "business_subscriptions") {
        return {
          select: vi.fn(() => ({
            not: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [{ stripe_subscription_id: "sub_demo_123", business_id: DEMO_BUSINESS_ID }],
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "businesses") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              lt: vi.fn(async () => ({
                data: [{ id: "exp_biz_1" }],
                error: null,
              })),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await resetDemoAndCancelSubscriptions({
      adminSupabase: { from, rpc },
      stripe: { subscriptions: { cancel } },
      env: { STRIPE_SECRET_KEY: "sk_test_123" },
    });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith("sub_demo_123");
    expect(rpc).toHaveBeenCalledWith("reset_demo_and_expired_data");
    expect(result).toEqual({
      ok: true,
      canceledSubscriptions: 1,
      demoReset: true,
      expiredBusinessesDeleted: 2,
      expiredUsersDeleted: 1,
    });
  });
});

describe("mapDemoRestrictionError", () => {
  it("maps demo immutability DB errors to clear UX copy", () => {
    expect(mapDemoRestrictionError({ message: "demo_telegram_disabled" })).toContain("Telegram");
    expect(mapDemoRestrictionError({ message: "demo_business_immutable" })).toContain("demo");
    expect(mapDemoRestrictionError({ message: "demo_member_immutable" })).toContain("demo");
    expect(mapDemoRestrictionError({ message: "other" })).toBeNull();
  });
});
