export type RawAvailableSlot = {
  staff_id: string;
  starts_at: string;
};

export type BookingDayOption = {
  dateKey: string;
  weekday: string;
  dayNumber: string;
  shortLabel: string;
  fullLabel: string;
};

export type GroupedBookingSlot = {
  startsAtIso: string;
  epochMs: number;
  staffIds: string[];
  dateKey: string;
  displayTime: string;
  shopTime: string;
  shortDateLabel: string;
  fullDateLabel: string;
};

function getDateKeyInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Generates an ordered list of calendar day descriptors starting at the
 * calendar date of `fromInstant` in `displayTimeZone`.
 */
export function buildBookingDateDays(
  fromInstant: Date,
  dayCount: number,
  displayTimeZone: string,
): BookingDayOption[] {
  const startKey = getDateKeyInTimeZone(fromInstant, displayTimeZone);
  const [year, month, day] = startKey.split("-").map(Number);

  const weekdayFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
  });
  const fullFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const days: BookingDayOption[] = [];
  for (let offset = 0; offset < dayCount; offset += 1) {
    const anchor = new Date(Date.UTC(year, month - 1, day + offset, 12, 0, 0));
    const y = anchor.getUTCFullYear();
    const m = String(anchor.getUTCMonth() + 1).padStart(2, "0");
    const d = anchor.getUTCDate();
    const dateKey = `${y}-${m}-${String(d).padStart(2, "0")}`;
    const weekday = weekdayFmt.format(anchor);
    const dayNumber = String(d);
    const fullLabel = fullFmt.format(anchor);

    days.push({
      dateKey,
      weekday,
      dayNumber,
      shortLabel: `${weekday} ${dayNumber}`,
      fullLabel,
    });
  }

  return days;
}

/**
 * Deduplicates `available_slots` instants (multiple barbers free at the same
 * timestamp in "Anyone available" mode) and groups them by date in
 * `displayTimeZone` while also computing the shop's local clock label.
 */
export function groupAvailableSlotsByDate(
  slots: RawAvailableSlot[],
  displayTimeZone: string,
  shopTimeZone: string,
): Record<string, GroupedBookingSlot[]> {
  const byInstant = new Map<string, GroupedBookingSlot>();

  const displayTimeFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: displayTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const shopTimeFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: shopTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const weekdayFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: displayTimeZone,
    weekday: "short",
  });
  const dayFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: displayTimeZone,
    day: "numeric",
  });
  const fullDateFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: displayTimeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  for (const row of slots) {
    const instant = new Date(row.starts_at);
    const epochMs = instant.getTime();
    if (Number.isNaN(epochMs)) {
      continue;
    }

    const canonicalIso = instant.toISOString();
    const existing = byInstant.get(canonicalIso);
    if (existing) {
      if (!existing.staffIds.includes(row.staff_id)) {
        existing.staffIds.push(row.staff_id);
      }
      continue;
    }

    const dateKey = getDateKeyInTimeZone(instant, displayTimeZone);
    const weekday = weekdayFmt.format(instant);
    const dayNum = dayFmt.format(instant);

    byInstant.set(canonicalIso, {
      startsAtIso: canonicalIso,
      epochMs,
      staffIds: [row.staff_id],
      dateKey,
      displayTime: displayTimeFmt.format(instant),
      shopTime: shopTimeFmt.format(instant),
      shortDateLabel: `${weekday} ${dayNum}`,
      fullDateLabel: fullDateFmt.format(instant),
    });
  }

  const grouped: Record<string, GroupedBookingSlot[]> = {};
  const sorted = Array.from(byInstant.values()).sort((a, b) => a.epochMs - b.epochMs);

  for (const slot of sorted) {
    if (!grouped[slot.dateKey]) {
      grouped[slot.dateKey] = [];
    }
    grouped[slot.dateKey].push(slot);
  }

  return grouped;
}

export function formatPriceCents(
  priceCents: number | null,
  currency = "USD",
): string | null {
  if (priceCents === null || priceCents === undefined) {
    return null;
  }
  if (priceCents === 0) {
    return "Free";
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
    }).format(priceCents / 100);
  } catch {
    const amount = (priceCents / 100).toFixed(priceCents % 100 === 0 ? 0 : 2);
    return `${currency} ${amount}`;
  }
}
