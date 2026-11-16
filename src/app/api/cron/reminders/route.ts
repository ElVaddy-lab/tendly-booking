import { drainNotificationOutbox, verifyCronSecret } from "@/lib/notifications";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

async function handleCronReminders(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const adminSupabase = createAdminSupabaseClient();
  const { data: enqueuedCount, error: enqueueError } = await adminSupabase.rpc(
    "enqueue_daily_staff_reminders",
  );

  if (enqueueError) {
    return Response.json(
      { error: "Failed to enqueue daily reminders." },
      { status: 500 },
    );
  }

  const drainSummary = await drainNotificationOutbox({
    supabase: adminSupabase,
    botToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || null,
  });

  return Response.json({
    ok: true,
    enqueuedReminders: enqueuedCount ?? 0,
    ...drainSummary,
  });
}

export async function GET(request: Request) {
  return handleCronReminders(request);
}

export async function POST(request: Request) {
  return handleCronReminders(request);
}
