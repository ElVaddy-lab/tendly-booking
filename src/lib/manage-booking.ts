import { isValidIanaTimeZone } from "./slug";

const MANAGE_TOKEN_PATTERN = /^[a-z0-9-]{16,128}$/i;

export function normalizeTimeZone(
  resolved: string | null | undefined,
  fallbackTimeZone: string,
): string {
  const trimmed = resolved?.trim() ?? "";
  if (!trimmed) {
    return fallbackTimeZone;
  }
  const canonical = trimmed === "Europe/Kiev" ? "Europe/Kyiv" : trimmed;
  return isValidIanaTimeZone(canonical) ? canonical : fallbackTimeZone;
}

export function formatBookingDateTime(
  iso: string,
  timeZone: string,
): { dateLabel: string; timeLabel: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { dateLabel: "Scheduled date", timeLabel: "" };
  }

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);

  return { dateLabel, timeLabel };
}

export function formatDeadlineLabel(iso: string, timeZone: string): string {
  const { dateLabel, timeLabel } = formatBookingDateTime(iso, timeZone);
  if (!timeLabel) {
    return "deadline";
  }
  return `${dateLabel} at ${timeLabel}`;
}

export function sanitizeManageToken(
  raw: string | null | undefined,
): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!MANAGE_TOKEN_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function isSameBookingSlot(params: {
  selectedStaffId: string | null;
  selectedStartsAtIso: string;
  currentStaffId: string;
  currentStartsAtIso: string;
}): boolean {
  if (
    params.selectedStaffId === null ||
    params.selectedStaffId !== params.currentStaffId
  ) {
    return false;
  }

  const selectedMs = Date.parse(params.selectedStartsAtIso);
  const currentMs = Date.parse(params.currentStartsAtIso);
  if (Number.isNaN(selectedMs) || Number.isNaN(currentMs)) {
    return params.selectedStartsAtIso === params.currentStartsAtIso;
  }

  return selectedMs === currentMs;
}

export function getDisplayInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "?";
}
