const WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_PER_IP = 50;
const DEFAULT_MAX_PER_EMAIL_KEY = 5;

const attemptStore = new Map<string, number[]>();

export type RateLimitInput = {
  ip?: string | null;
  email: string;
  nowMs?: number;
  maxPerIp?: number;
  maxPerEmail?: number;
};

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number; reason: "ip" | "email" };

function pruneAndCount(key: string, nowMs: number, windowMs: number): number[] {
  const cutoff = nowMs - windowMs;
  const existing = attemptStore.get(key) ?? [];
  const active = existing.filter((ts) => ts > cutoff);
  if (active.length === 0) {
    attemptStore.delete(key);
  } else {
    attemptStore.set(key, active);
  }
  return active;
}

/**
 * Sliding-window booking rate limiter keyed by client IP and (IP + email).
 * Records an attempt when allowed.
 */
export function checkBookingRateLimit(input: RateLimitInput): RateLimitResult {
  const nowMs = input.nowMs ?? Date.now();
  const maxPerIp = input.maxPerIp ?? DEFAULT_MAX_PER_IP;
  const maxPerEmail = input.maxPerEmail ?? DEFAULT_MAX_PER_EMAIL_KEY;

  const normalizedIp = input.ip?.trim() || "unknown";
  const normalizedEmail = input.email.trim().toLowerCase();

  const ipKey = `ip:${normalizedIp}`;
  const emailKey = `ip-email:${normalizedIp}:${normalizedEmail}`;

  const emailAttempts = pruneAndCount(emailKey, nowMs, WINDOW_MS);
  if (emailAttempts.length >= maxPerEmail) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((emailAttempts[0] + WINDOW_MS - nowMs) / 1000),
    );
    return { allowed: false, retryAfterSeconds, reason: "email" };
  }

  const ipAttempts =
    normalizedIp !== "unknown" ? pruneAndCount(ipKey, nowMs, WINDOW_MS) : [];
  if (normalizedIp !== "unknown" && ipAttempts.length >= maxPerIp) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((ipAttempts[0] + WINDOW_MS - nowMs) / 1000),
    );
    return { allowed: false, retryAfterSeconds, reason: "ip" };
  }

  if (normalizedIp !== "unknown") {
    attemptStore.set(ipKey, [...ipAttempts, nowMs]);
  }
  attemptStore.set(emailKey, [...emailAttempts, nowMs]);

  // Opportunistic sweep when the in-memory store grows large.
  if (attemptStore.size > 1000) {
    const cutoff = nowMs - WINDOW_MS;
    for (const [k, list] of attemptStore.entries()) {
      const kept = list.filter((ts) => ts > cutoff);
      if (kept.length === 0) {
        attemptStore.delete(k);
      } else {
        attemptStore.set(k, kept);
      }
    }
  }

  const remainingEmail = maxPerEmail - (emailAttempts.length + 1);
  const remainingIp =
    normalizedIp !== "unknown" ? maxPerIp - (ipAttempts.length + 1) : remainingEmail;

  return {
    allowed: true,
    remaining: Math.min(remainingEmail, remainingIp),
  };
}

export function resetBookingRateLimitStore(): void {
  attemptStore.clear();
}
