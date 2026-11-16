import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";

const START_COMMAND_RE = /^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]{16,64})$/;

function timingSafeMatch(actual: string, expected: string): boolean {
  const a = Buffer.from(actual, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function isLoopbackHostname(urlStr: string): boolean {
  try {
    const { hostname } = new URL(urlStr);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function extractBearerOrHeaderToken(request: Request, headerName: string): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }
  const directHeader = request.headers.get(headerName)?.trim();
  return directHeader || null;
}

/**
 * Extracts a staff Telegram binding code from `/start <code>` or `/start@Bot <code>`.
 */
export function parseTelegramStartCommand(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  if (!trimmed) {
    return null;
  }
  const match = START_COMMAND_RE.exec(trimmed);
  return match?.[1] ?? null;
}

/**
 * Validates `Authorization: Bearer <token>` or `x-cron-secret` against CRON_SECRET.
 * In local loopback environments with CRON_SECRET unset, requires any non-empty token.
 */
export function verifyCronSecret(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const token = extractBearerOrHeaderToken(request, "x-cron-secret");
  const expected = env.CRON_SECRET?.trim() ?? "";

  if (!expected) {
    if (!isLoopbackHostname(request.url)) {
      return { ok: false, status: 503, error: "CRON_SECRET is not configured." };
    }
    if (!token) {
      return { ok: false, status: 401, error: "Unauthorized cron request." };
    }
    return { ok: true };
  }

  if (!token || !timingSafeMatch(token, expected)) {
    return { ok: false, status: 401, error: "Unauthorized cron request." };
  }

  return { ok: true };
}

/**
 * Checks Telegram's optional `x-telegram-bot-api-secret-token` header when configured.
 */
export function verifyTelegramWebhookSecret(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
  if (!expected) {
    return true;
  }
  const actual = request.headers.get("x-telegram-bot-api-secret-token")?.trim() ?? "";
  if (!actual) {
    return false;
  }
  return timingSafeMatch(actual, expected);
}

/**
 * Delivers one text message via the Telegram Bot API.
 */
export async function sendTelegramMessage(input: {
  botToken: string;
  chatId: number;
  text: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const doFetch = input.fetchImpl ?? fetch;
  try {
    const response = await doFetch(
      `https://api.telegram.org/bot${input.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: input.text,
        }),
      },
    );

    let description: string | undefined;
    try {
      const json = (await response.json()) as { ok?: boolean; description?: string };
      if (response.ok && json.ok !== false) {
        return { ok: true };
      }
      description = json.description;
    } catch {
      // Fallback to status text below.
    }

    return {
      ok: false,
      error: description || `Telegram API error (${response.status})`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network error contacting Telegram.",
    };
  }
}

/**
 * Drains pending due rows from `notification_outbox` via Telegram Bot API
 * or marks them `sent` in local/dry-run mode when TELEGRAM_BOT_TOKEN is unset.
 */
export async function drainNotificationOutbox(input: {
  supabase: SupabaseClient<Database>;
  botToken?: string | null;
  fetchImpl?: typeof fetch;
  limit?: number;
}): Promise<{ processed: number; sent: number; failed: number }> {
  const limit = input.limit ?? 50;
  const nowIso = new Date().toISOString();

  const { data: pendingRows, error } = await input.supabase
    .from("notification_outbox")
    .select("id, telegram_chat_id, message_text, attempt_count")
    .eq("status", "pending")
    .lte("scheduled_for", nowIso)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !pendingRows || pendingRows.length === 0) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  const trimmedToken = input.botToken?.trim() || "";
  let sent = 0;
  let failed = 0;

  for (const row of pendingRows) {
    const nextAttempts = row.attempt_count + 1;
    const delivery = trimmedToken
      ? await sendTelegramMessage({
          botToken: trimmedToken,
          chatId: row.telegram_chat_id,
          text: row.message_text,
          fetchImpl: input.fetchImpl,
        })
      : ({ ok: true } as const);

    if (delivery.ok) {
      await input.supabase
        .from("notification_outbox")
        .update({
          status: "sent",
          attempt_count: nextAttempts,
          last_error: null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      sent += 1;
    } else {
      await input.supabase
        .from("notification_outbox")
        .update({
          status: "failed",
          attempt_count: nextAttempts,
          last_error: delivery.error.slice(0, 500),
        })
        .eq("id", row.id);
      failed += 1;
    }
  }

  return {
    processed: pendingRows.length,
    sent,
    failed,
  };
}
