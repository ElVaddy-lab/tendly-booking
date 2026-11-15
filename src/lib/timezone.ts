import { isValidIanaTimeZone } from "./slug";

const LOCAL_DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const RANGE_PATTERN = /^[\[(]\s*"?([^",]+)"?\s*,\s*"?([^"\])]+)"?\s*[\])]$/;

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getLocalParts(utcMs: number, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(new Date(utcMs));
  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    year: lookup("year"),
    month: lookup("month"),
    day: lookup("day"),
    hour: lookup("hour"),
    minute: lookup("minute"),
    second: lookup("second"),
  };
}

function getTimeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const p = getLocalParts(utcMs, timeZone);
  const asUtcMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtcMs - utcMs;
}

/**
 * Converts a wall-clock datetime (`YYYY-MM-DDTHH:mm`) in the given IANA time
 * zone to an ISO-8601 UTC string, or returns null when invalid.
 */
export function localDateTimeToUtcIso(
  localDateTime: string,
  timeZone: string,
): string | null {
  if (!isValidIanaTimeZone(timeZone)) {
    return null;
  }

  const match = LOCAL_DATETIME_PATTERN.exec(localDateTime.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const targetUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const calendarCheck = new Date(targetUtcMs);
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) {
    return null;
  }

  const firstPass = targetUtcMs - getTimeZoneOffsetMs(targetUtcMs, timeZone);
  const resolvedMs = targetUtcMs - getTimeZoneOffsetMs(firstPass, timeZone);
  const verify = getLocalParts(resolvedMs, timeZone);

  if (
    verify.year !== year ||
    verify.month !== month ||
    verify.day !== day ||
    verify.hour !== hour ||
    verify.minute !== minute
  ) {
    return null;
  }

  return new Date(resolvedMs).toISOString();
}

export function parsePostgresRange(
  period: unknown,
): { start: Date; end: Date } | null {
  if (typeof period !== "string") {
    return null;
  }
  const match = RANGE_PATTERN.exec(period.trim());
  if (!match) {
    return null;
  }

  const normalize = (raw: string) =>
    raw.trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const start = new Date(normalize(match[1]));
  const end = new Date(normalize(match[2]));

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return { start, end };
}

export function formatTimeOffPeriod(period: unknown, timeZone: string): string {
  const parsed = parsePostgresRange(period);
  if (!parsed) {
    return typeof period === "string" ? period : "Scheduled time off";
  }

  const dayFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateLabelFmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const startDay = dayFmt.format(parsed.start);
  const endDay = dayFmt.format(parsed.end);

  if (startDay === endDay) {
    return `${dateLabelFmt.format(parsed.start)}, ${timeFmt.format(parsed.start)}–${timeFmt.format(parsed.end)}`;
  }

  return `${dateLabelFmt.format(parsed.start)}, ${timeFmt.format(parsed.start)} – ${dateLabelFmt.format(parsed.end)}, ${timeFmt.format(parsed.end)}`;
}
