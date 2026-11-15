"use client";

import Script from "next/script";

import { TURNSTILE_TEST_SITE_KEY } from "@/lib/turnstile-constants";

/**
 * Renders a Cloudflare Turnstile widget in live environments or a deterministic
 * hidden token input when Cloudflare's always-pass test key is active.
 */
export function TurnstileField() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? TURNSTILE_TEST_SITE_KEY;
  const isTestMode = !siteKey || siteKey === TURNSTILE_TEST_SITE_KEY;

  if (isTestMode) {
    return <input type="hidden" name="cf-turnstile-response" value="turnstile-test-token" />;
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
      <div className="cf-turnstile" data-sitekey={siteKey} data-theme="light" />
    </>
  );
}
