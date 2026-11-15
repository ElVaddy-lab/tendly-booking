export function pickSingleParam(
  value: string | string[] | undefined,
): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return null;
}

/**
 * Allows only relative post-auth redirects targeting `/invite/...` so open
 * redirects and protocol-relative URLs (`//...`) are rejected.
 */
export function sanitizeInviteNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (
    !trimmed.startsWith("/invite/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\")
  ) {
    return null;
  }
  return trimmed;
}
