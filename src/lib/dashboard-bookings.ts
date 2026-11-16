export type CalendarRangeBooking = {
  startsAt: string;
  endsAt: string;
};

export type CalendarRangeHour = {
  start_time: string;
  end_time: string;
};

/**
 * Formats an ISO timestamp (or Date) into `YYYY-MM-DD` in the specified IANA timezone.
 */
export function formatDateKeyInZone(
  isoOrDate: string | Date,
  timeZone: string,
): string {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) {
    return "1970-01-01";
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Pure calendar arithmetic on `YYYY-MM-DD` strings (immune to DST offset shifts).
 */
export function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day + deltaDays, 12, 0, 0));
  const y = anchor.getUTCFullYear();
  const m = String(anchor.getUTCMonth() + 1).padStart(2, "0");
  const d = String(anchor.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns the 7 `YYYY-MM-DD` keys (Monday through Sunday) for the week containing `anchorDateKey`.
 */
export function getWeekDateKeys(anchorDateKey: string): string[] {
  const [year, month, day] = anchorDateKey.split("-").map(Number);
  const utcMidday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  // getUTCDay(): 0 = Sun, 1 = Mon, ... 6 = Sat -> convert to Mon=0 .. Sun=6
  const mondayOffset = (utcMidday.getUTCDay() + 6) % 7;
  const mondayKey = addDaysToDateKey(anchorDateKey, -mondayOffset);

  return Array.from({ length: 7 }, (_, index) =>
    addDaysToDateKey(mondayKey, index),
  );
}

export function getMinutesSinceMidnightInZone(
  iso: string,
  timeZone: string,
): number {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function formatZonedTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatZonedShortDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(anchor);
}

export function formatZonedLongDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(anchor);
}

export function computeCalendarRangeHours(params: {
  bookings: CalendarRangeBooking[];
  weeklyHours: CalendarRangeHour[];
  timeZone: string;
}): { startHour: number; endHour: number } {
  let minHour = 8;
  let maxHour = 20;

  for (const row of params.weeklyHours) {
    const startH = Number(row.start_time.slice(0, 2));
    const endH = Number(row.end_time.slice(0, 2));
    const endM = Number(row.end_time.slice(3, 5));
    if (!Number.isNaN(startH)) {
      minHour = Math.min(minHour, startH);
    }
    if (!Number.isNaN(endH)) {
      maxHour = Math.max(maxHour, endM > 0 ? Math.min(24, endH + 1) : endH);
    }
  }

  for (const booking of params.bookings) {
    const startMins = getMinutesSinceMidnightInZone(
      booking.startsAt,
      params.timeZone,
    );
    const endMins = getMinutesSinceMidnightInZone(booking.endsAt, params.timeZone);
    minHour = Math.min(minHour, Math.floor(startMins / 60));
    maxHour = Math.max(
      maxHour,
      Math.min(24, Math.ceil(Math.max(endMins, startMins + 15) / 60)),
    );
  }

  const startHour = Math.max(0, Math.min(minHour, 22));
  const endHour = Math.max(startHour + 2, Math.min(24, maxHour));
  return { startHour, endHour };
}

export function computeDayBlockPlacement(params: {
  startsAtIso: string;
  endsAtIso: string;
  startHour: number;
  endHour: number;
  timeZone: string;
}): { topPercent: number; heightPercent: number } {
  const totalMinutes = Math.max(60, (params.endHour - params.startHour) * 60);
  const startOffsetMins =
    getMinutesSinceMidnightInZone(params.startsAtIso, params.timeZone) -
    params.startHour * 60;
  let endOffsetMins =
    getMinutesSinceMidnightInZone(params.endsAtIso, params.timeZone) -
    params.startHour * 60;

  if (endOffsetMins <= startOffsetMins) {
    endOffsetMins = startOffsetMins + 30;
  }

  const clampedStart = Math.max(0, Math.min(totalMinutes - 15, startOffsetMins));
  const clampedEnd = Math.max(
    clampedStart + 15,
    Math.min(totalMinutes, endOffsetMins),
  );

  return {
    topPercent: (clampedStart / totalMinutes) * 100,
    heightPercent: ((clampedEnd - clampedStart) / totalMinutes) * 100,
  };
}

export function isSyntheticPlaceholderEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return (
    normalized.endsWith("@walkin.invalid") ||
    normalized.endsWith("@redacted.invalid")
  );
}

/**
 * Returns ISO weekday (1 = Monday .. 7 = Sunday) for a `YYYY-MM-DD` date key.
 */
export function getIsoWeekdayFromDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utcDay = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
}

export type PlacedDayBlock = {
  id: string;
  lane: number;
  laneCount: number;
};

/**
 * Assigns horizontal lanes when two bookings share overlapping wall time
 * (for example a cancelled appointment alongside a rebooked appointment).
 */
export function layoutDayCalendarBlocks(
  items: Array<{ id: string; startsAt: string; endsAt: string }>,
): PlacedDayBlock[] {
  if (items.length === 0) {
    return [];
  }

  const normalized = items
    .map((item) => {
      const startMs = Date.parse(item.startsAt);
      const rawEnd = Date.parse(item.endsAt);
      const endMs = Number.isNaN(rawEnd) || rawEnd <= startMs ? startMs + 15 * 60_000 : rawEnd;
      return { id: item.id, startMs, endMs };
    })
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id));

  const clusters: Array<Array<{ id: string; startMs: number; endMs: number }>> = [];
  let currentCluster: Array<{ id: string; startMs: number; endMs: number }> = [];
  let clusterMaxEnd = -1;

  for (const item of normalized) {
    if (currentCluster.length === 0 || item.startMs < clusterMaxEnd) {
      currentCluster.push(item);
      clusterMaxEnd = Math.max(clusterMaxEnd, item.endMs);
    } else {
      clusters.push(currentCluster);
      currentCluster = [item];
      clusterMaxEnd = item.endMs;
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  const placed: PlacedDayBlock[] = [];
  for (const cluster of clusters) {
    const laneEnds: number[] = [];
    const assigned: Array<{ id: string; lane: number }> = [];

    for (const item of cluster) {
      let laneIndex = laneEnds.findIndex((endMs) => endMs <= item.startMs);
      if (laneIndex === -1) {
        laneIndex = laneEnds.length;
        laneEnds.push(item.endMs);
      } else {
        laneEnds[laneIndex] = item.endMs;
      }
      assigned.push({ id: item.id, lane: laneIndex });
    }

    const laneCount = Math.max(1, laneEnds.length);
    for (const entry of assigned) {
      placed.push({ id: entry.id, lane: entry.lane, laneCount });
    }
  }

  return placed;
}
