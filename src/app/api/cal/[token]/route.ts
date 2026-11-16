import {
  buildStaffCalendarIcs,
  buildStaffCalendarIcsFilename,
  type StaffCalendarEventInput,
} from "@/lib/ics";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

const ICS_TOKEN_RE = /^[0-9a-f]{64}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!ICS_TOKEN_RE.test(token)) {
    return new Response("Calendar feed not found.", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase.rpc("get_staff_calendar_feed", {
    p_token: token,
  });

  if (error || !data || data.length === 0) {
    return new Response("Calendar feed not found.", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const first = data[0];
  const events: StaffCalendarEventInput[] = [];

  for (const row of data) {
    if (!row.booking_id || !row.starts_at || !row.ends_at || !row.status) {
      continue;
    }
    const isErased = row.customer_name === "Client" && row.notes === null;
    events.push({
      bookingId: row.booking_id,
      serviceName: row.service_name ?? "Appointment",
      startsAtIso: row.starts_at,
      endsAtIso: row.ends_at,
      status: row.status,
      customerName: row.customer_name ?? "Client",
      notes: row.notes,
      erased: isErased,
    });
  }

  const body = buildStaffCalendarIcs({
    businessName: first.business_name,
    businessTimezone: first.business_timezone,
    staffName: first.staff_name,
    events,
  });
  const filename = buildStaffCalendarIcsFilename(first.business_slug, first.staff_name);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
