const WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_PER_IP = 50;
const DEFAULT_MAX_PER_EMAIL_KEY = 5;
const DEFAULT_MANAGE_MAX_PER_IP = 30;
const DEFAULT_MANAGE_MAX_PER_TOKEN = 15;

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

export type ManageRateLimitInput = {
  ip?: string | null;
  token: string;
  nowMs?: number;
  maxPerIp?: number;
  maxPerToken?: number;
};

export type ManageRateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number; reason: "ip" | "token" };

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

function sweepExpiredAttempts(nowMs: number, windowMs: number): void {
  if (attemptStore.size <= 1000) {
    return;
  }
  const cutoff = nowMs - windowMs;
  for (const [key, list] of attemptStore.entries()) {
    const kept = list.filter((ts) => ts > cutoff);
    if (kept.length === 0) {
      attemptStore.delete(key);
    } else {
      attemptStore.set(key, kept);
    }
  }
}

function enforceSlidingLimit<TSecondaryReason extends string>(params: {
  ip: string | null | undefined;
  ipPrefix: string;
  secondaryKey: string;
  secondaryReason: TSecondaryReason;
  maxPerIp: number;
  maxSecondary: number;
  nowMs: number;
}):
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number; reason: "ip" | TSecondaryReason } {
  const normalizedIp = params.ip?.trim() || "unknown";
  const ipKey = `${params.ipPrefix}:${normalizedIp}`;

  const secondaryAttempts = pruneAndCount(params.secondaryKey, params.nowMs, WINDOW_MS);
  if (secondaryAttempts.length >= params.maxSecondary) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((secondaryAttempts[0] + WINDOW_MS - params.nowMs) / 1000),
    );
    return {
      allowed: false,
      retryAfterSeconds,
      reason: params.secondaryReason,
    };
  }

  const ipAttempts =
    normalizedIp !== "unknown" ? pruneAndCount(ipKey, params.nowMs, WINDOW_MS) : [];
  if (normalizedIp !== "unknown" && ipAttempts.length >= params.maxPerIp) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((ipAttempts[0] + WINDOW_MS - params.nowMs) / 1000),
    );
    return {
      allowed: false,
      retryAfterSeconds,
      reason: "ip",
    };
  }

  if (normalizedIp !== "unknown") {
    attemptStore.set(ipKey, [...ipAttempts, params.nowMs]);
  }
  attemptStore.set(params.secondaryKey, [...secondaryAttempts, params.nowMs]);

  sweepExpiredAttempts(params.nowMs, WINDOW_MS);

  const remainingSecondary = params.maxSecondary - (secondaryAttempts.length + 1);
  const remainingIp =
    normalizedIp !== "unknown"
      ? params.maxPerIp - (ipAttempts.length + 1)
      : remainingSecondary;

  return {
    allowed: true,
    remaining: Math.min(remainingSecondary, remainingIp),
  };
}

/**
 * Sliding-window booking rate limiter keyed by client IP and (IP + email).
 * Records an attempt when allowed.
 */
export function checkBookingRateLimit(input: RateLimitInput): RateLimitResult {
  const normalizedIp = input.ip?.trim() || "unknown";
  const normalizedEmail = input.email.trim().toLowerCase();

  return enforceSlidingLimit({
    ip: normalizedIp,
    ipPrefix: "ip",
    secondaryKey: `ip-email:${normalizedIp}:${normalizedEmail}`,
    secondaryReason: "email",
    maxPerIp: input.maxPerIp ?? DEFAULT_MAX_PER_IP,
    maxSecondary: input.maxPerEmail ?? DEFAULT_MAX_PER_EMAIL_KEY,
    nowMs: input.nowMs ?? Date.now(),
  });
}

/**
 * Sliding-window rate limiter for public manage-link actions keyed by client IP and (IP + token prefix).
 */
export function checkManageRateLimit(
  input: ManageRateLimitInput,
): ManageRateLimitResult {
  const normalizedIp = input.ip?.trim() || "unknown";
  const normalizedToken = input.token.trim().toLowerCase().slice(0, 24);

  return enforceSlidingLimit({
    ip: normalizedIp,
    ipPrefix: "manage-ip",
    secondaryKey: `manage-token:${normalizedIp}:${normalizedToken}`,
    secondaryReason: "token",
    maxPerIp: input.maxPerIp ?? DEFAULT_MANAGE_MAX_PER_IP,
    maxSecondary: input.maxPerToken ?? DEFAULT_MANAGE_MAX_PER_TOKEN,
    nowMs: input.nowMs ?? Date.now(),
  });
}

export function resetBookingRateLimitStore(): void {
  attemptStore.clear();
}
