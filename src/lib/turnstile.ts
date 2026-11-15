import "server-only";

import { TURNSTILE_TEST_SITE_KEY } from "./turnstile-constants";

export { TURNSTILE_TEST_SITE_KEY };
export const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function isTurnstileTestMode(
  siteKey: string | undefined = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  secretKey: string | undefined = process.env.TURNSTILE_SECRET_KEY,
): boolean {
  return (
    siteKey === TURNSTILE_TEST_SITE_KEY ||
    !secretKey ||
    secretKey === TURNSTILE_TEST_SECRET_KEY
  );
}

/**
 * Verifies a Cloudflare Turnstile token on the server.
 * When using Cloudflare's always-pass test secret (or when no secret is set
 * locally), any non-empty token passes without making a network request.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<boolean> {
  const trimmed = token?.trim() ?? "";
  if (!trimmed) {
    return false;
  }

  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey || secretKey === TURNSTILE_TEST_SECRET_KEY) {
    return true;
  }

  const body = new URLSearchParams({
    secret: secretKey,
    response: trimmed,
  });
  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      return false;
    }
    const payload = (await response.json()) as { success?: unknown };
    return payload.success === true;
  } catch {
    return false;
  }
}
