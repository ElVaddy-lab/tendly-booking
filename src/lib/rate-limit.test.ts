import { beforeEach, describe, expect, it } from "vitest";

import {
  checkBookingRateLimit,
  checkManageRateLimit,
  resetBookingRateLimitStore,
} from "./rate-limit";

describe("booking rate limiter", () => {
  beforeEach(() => {
    resetBookingRateLimitStore();
  });

  it("allows up to 5 requests per email + IP within 10 minutes and blocks the 6th", () => {
    const baseMs = 1_700_000_000_000;

    for (let i = 0; i < 5; i += 1) {
      const result = checkBookingRateLimit({
        ip: "203.0.113.10",
        email: "Client@Example.test",
        nowMs: baseMs + i * 1000,
      });
      expect(result.allowed).toBe(true);
    }

    const blocked = checkBookingRateLimit({
      ip: "203.0.113.10",
      email: "  client@example.test ",
      nowMs: baseMs + 6000,
    });
    expect(blocked).toEqual({
      allowed: false,
      reason: "email",
      retryAfterSeconds: 594,
    });
  });

  it("enforces the IP ceiling across different emails", () => {
    const baseMs = 1_700_000_000_000;

    for (let i = 0; i < 50; i += 1) {
      const result = checkBookingRateLimit({
        ip: "198.51.100.7",
        email: `person${i}@example.test`,
        nowMs: baseMs + i * 1000,
      });
      expect(result.allowed).toBe(true);
    }

    const blocked = checkBookingRateLimit({
      ip: "198.51.100.7",
      email: "person51@example.test",
      nowMs: baseMs + 55_000,
    });
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.reason).toBe("ip");
    }
  });

  it("resets cleanly after the 10-minute window expires", () => {
    const baseMs = 1_700_000_000_000;

    for (let i = 0; i < 5; i += 1) {
      checkBookingRateLimit({
        ip: "192.0.2.5",
        email: "user@example.test",
        nowMs: baseMs + i * 1000,
      });
    }

    const afterWindow = checkBookingRateLimit({
      ip: "192.0.2.5",
      email: "user@example.test",
      nowMs: baseMs + 10 * 60 * 1000 + 1,
    });
    expect(afterWindow.allowed).toBe(true);
  });

  it("enforces manage rate limit per token and per IP", () => {
    const baseMs = 1_700_000_000_000;

    for (let i = 0; i < 15; i += 1) {
      const result = checkManageRateLimit({
        ip: "203.0.113.55",
        token: "abcdef0123456789".repeat(4),
        nowMs: baseMs + i * 1000,
      });
      expect(result.allowed).toBe(true);
    }

    const tokenBlocked = checkManageRateLimit({
      ip: "203.0.113.55",
      token: "abcdef0123456789".repeat(4),
      nowMs: baseMs + 20_000,
    });
    expect(tokenBlocked.allowed).toBe(false);
    if (!tokenBlocked.allowed) {
      expect(tokenBlocked.reason).toBe("token");
    }

    for (let i = 0; i < 15; i += 1) {
      const ok = checkManageRateLimit({
        ip: "203.0.113.55",
        token: `${String(i).padStart(2, "0")}bcdef0123456789`.repeat(4),
        nowMs: baseMs + 30_000 + i * 1000,
      });
      expect(ok.allowed).toBe(true);
    }

    const ipBlocked = checkManageRateLimit({
      ip: "203.0.113.55",
      token: "99bcdef0123456789".repeat(4),
      nowMs: baseMs + 60_000,
    });
    expect(ipBlocked.allowed).toBe(false);
    if (!ipBlocked.allowed) {
      expect(ipBlocked.reason).toBe("ip");
    }
  });
});
