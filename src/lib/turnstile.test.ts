import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TURNSTILE_TEST_SECRET_KEY,
  TURNSTILE_TEST_SITE_KEY,
  isTurnstileTestMode,
  verifyTurnstileToken,
} from "./turnstile";

describe("isTurnstileTestMode", () => {
  it("returns true for test keys or missing secret", () => {
    expect(isTurnstileTestMode(TURNSTILE_TEST_SITE_KEY, "live-secret")).toBe(true);
    expect(isTurnstileTestMode("live-site", undefined)).toBe(true);
    expect(isTurnstileTestMode("live-site", "")).toBe(true);
    expect(isTurnstileTestMode("live-site", TURNSTILE_TEST_SECRET_KEY)).toBe(true);
  });

  it("returns false when both keys are non-test values", () => {
    expect(isTurnstileTestMode("0x4AAAAAAA_live", "0x4AAAAAAA_secret")).toBe(false);
  });
});

describe("verifyTurnstileToken", () => {
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.TURNSTILE_SECRET_KEY;
    } else {
      process.env.TURNSTILE_SECRET_KEY = originalSecret;
    }
  });

  it("rejects missing or blank tokens even in test mode", async () => {
    process.env.TURNSTILE_SECRET_KEY = TURNSTILE_TEST_SECRET_KEY;
    expect(await verifyTurnstileToken(undefined)).toBe(false);
    expect(await verifyTurnstileToken(null)).toBe(false);
    expect(await verifyTurnstileToken("")).toBe(false);
    expect(await verifyTurnstileToken("   ")).toBe(false);
  });

  it("accepts non-empty tokens in test mode without calling fetch", async () => {
    process.env.TURNSTILE_SECRET_KEY = TURNSTILE_TEST_SECRET_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(await verifyTurnstileToken("turnstile-test-token")).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns true when Cloudflare siteverify succeeds", async () => {
    process.env.TURNSTILE_SECRET_KEY = "0x4AAAAAAA_live_secret";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const ok = await verifyTurnstileToken("  live-token  ", "203.0.113.1");

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init?.method).toBe("POST");
    const params = init?.body as URLSearchParams;
    expect(params.get("secret")).toBe("0x4AAAAAAA_live_secret");
    expect(params.get("response")).toBe("live-token");
    expect(params.get("remoteip")).toBe("203.0.113.1");
  });

  it("returns false when Cloudflare siteverify fails or returns non-200", async () => {
    process.env.TURNSTILE_SECRET_KEY = "0x4AAAAAAA_live_secret";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false }), { status: 200 }),
    );
    expect(await verifyTurnstileToken("bad-token")).toBe(false);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("error", { status: 500 }));
    expect(await verifyTurnstileToken("bad-token")).toBe(false);
  });

  it("returns false on network error", async () => {
    process.env.TURNSTILE_SECRET_KEY = "0x4AAAAAAA_live_secret";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network down"));

    expect(await verifyTurnstileToken("live-token")).toBe(false);
  });
});
