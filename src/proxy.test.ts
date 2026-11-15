import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import { config } from "./proxy";

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("proxy matcher", () => {
  it.each(["/dashboard", "/dashboard/calendar", "/onboarding", "/sign-in", "/sign-up"])(
    "runs on private and auth route %s",
    (path) => {
      expect(matches(path)).toBe(true);
    },
  );

  // Public routes must never get a session Set-Cookie, so shared caches cannot leak it.
  it.each([
    "/",
    "/b/demo-barbershop",
    "/b/demo-barbershop/book",
    "/manage/some-token",
    "/api/webhooks/stripe",
    "/api/cron/reminders",
  ])("skips public route %s", (path) => {
    expect(matches(path)).toBe(false);
  });
});
