export type BookingIcsInput = {
  bookingId: string;
  businessName: string;
  businessSlug: string;
  serviceName: string;
  staffName: string;
  startsAtIso: string;
  endsAtIso: string;
  manageUrl: string;
  notes?: string | null;
  now?: Date;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Formats an instant into RFC 5545 UTC timestamp format (`YYYYMMDDTHHMMSSZ`).
 */
export function formatUtcIcsTimestamp(input: string | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ICS timestamp input: ${String(input)}`);
  }

  return (
    `${date.getUTCFullYear()}` +
    `${pad2(date.getUTCMonth() + 1)}` +
    `${pad2(date.getUTCDate())}T` +
    `${pad2(date.getUTCHours())}` +
    `${pad2(date.getUTCMinutes())}` +
    `${pad2(date.getUTCSeconds())}Z`
  );
}

/**
 * Escapes RFC 5545 TEXT property values (`\\`, `;`, `,`, and line breaks).
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/**
 * Folds long content lines at 72 UTF-16 code units / <=75 octets per RFC 5545 §3.1.
 */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) {
    return line;
  }

  const chunks: string[] = [];
  let current = "";

  for (const ch of line) {
    const maxBytes = chunks.length === 0 ? 75 : 74;
    if (encoder.encode(current + ch).length > maxBytes && current.length > 0) {
      chunks.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks.join("\r\n ");
}

/**
 * Builds an RFC 5545 iCalendar string for a confirmed booking.
 */
export function buildBookingIcs(input: BookingIcsInput): string {
  const dtStamp = formatUtcIcsTimestamp(input.now ?? new Date());
  const dtStart = formatUtcIcsTimestamp(input.startsAtIso);
  const dtEnd = formatUtcIcsTimestamp(input.endsAtIso);

  const summary = `${input.serviceName} — ${input.businessName}`;
  const descriptionLines = [
    `Barber: ${input.staffName}`,
    `Manage or cancel: ${input.manageUrl}`,
  ];
  const trimmedNotes = input.notes?.trim();
  if (trimmedNotes) {
    descriptionLines.push(`Notes: ${trimmedNotes}`);
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tendly//Public Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(input.bookingId)}@tendly.app`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(descriptionLines.join("\n"))}`,
    `LOCATION:${escapeIcsText(input.businessName)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export function buildBookingIcsFilename(slug: string, startsAtIso: string): string {
  const safeSlug = slug.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "") || "booking";
  const date = new Date(startsAtIso);
  if (Number.isNaN(date.getTime())) {
    return `tendly-${safeSlug}.ics`;
  }
  const stamp =
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `-${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}`;
  return `tendly-${safeSlug}-${stamp}.ics`;
}
