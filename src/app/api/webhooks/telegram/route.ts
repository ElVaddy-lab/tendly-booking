import {
  parseTelegramStartCommand,
  sendTelegramMessage,
  verifyTelegramWebhookSecret,
} from "@/lib/notifications";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type TelegramUpdatePayload = {
  message?: {
    text?: unknown;
    chat?: {
      id?: unknown;
    };
  };
};

export async function POST(request: Request) {
  if (!verifyTelegramWebhookSecret(request)) {
    return Response.json(
      { error: "Unauthorized webhook request." },
      { status: 401 },
    );
  }

  let body: TelegramUpdatePayload;
  try {
    body = (await request.json()) as TelegramUpdatePayload;
  } catch {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const text = typeof body.message?.text === "string" ? body.message.text : null;
  const chatId =
    typeof body.message?.chat?.id === "number" && Number.isFinite(body.message.chat.id)
      ? body.message.chat.id
      : null;

  const code = parseTelegramStartCommand(text);
  if (!code || chatId === null) {
    return Response.json({ ok: true, ignored: true });
  }

  const adminSupabase = createAdminSupabaseClient();
  const { data, error } = await adminSupabase.rpc("complete_telegram_link", {
    p_link_code: code,
    p_telegram_chat_id: chatId,
  });

  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    return Response.json({
      ok: true,
      linked: false,
      reason: "invalid_or_expired_link_code",
    });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (botToken) {
    await sendTelegramMessage({
      botToken,
      chatId,
      text: `Connected! You will now receive Tendly booking notifications for ${row.staff_name}.`,
    });
  }

  return Response.json({
    ok: true,
    linked: true,
    staffId: row.staff_id,
    staffName: row.staff_name,
    businessId: row.business_id,
  });
}
