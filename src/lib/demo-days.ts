export type Day = { key: string; weekday: string; date: number };

/**
 * The five bookable days shown on the landing card, starting two days after
 * "today" in the business's own time zone (never the visitor's).
 */
export function upcomingDays(now: Date, timeZone: string, count = 5, offset = 2): Day[] {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

  return Array.from({ length: count }, (_, i) => {
    const day = new Date(Date.UTC(y, m - 1, d + offset + i, 12));
    return { key: day.toISOString().slice(0, 10), weekday: weekday.format(day), date: day.getUTCDate() };
  });
}
