import { describe, expect, it, vi } from "vitest";

import {
  drainNotificationOutbox,
  parseTelegramStartCommand,
  sendTelegramMessage,
  verifyCronSecret,
  verifyTelegramWebhookSecret,
} from "./notifications";

describe("parseTelegramStartCommand", () => {
  it("extracts valid hex codes from /start and /start@bot commands", () => {
    expect(parseTelegramStartCommand("/start 0123456789abcdef0123456789abcdef")).toBe(
      "0123456789abcdef0123456789abcdef",
    );
    expect(
      parseTelegramStartCommand("  /start@TendlyBot abcdef0123456789  "),
    ).toBe("abcdef0123456789");
  });

  it("returns null for unrelated messages, missing code, or invalid payloads", () => {
    expect(parseTelegramStartCommand(null)).toBeNull();
    expect(parseTelegramStartCommand("hello")).toBeNull();
    expect(parseTelegramStartCommand("/start")).toBeNull();
    expect(parseTelegramStartCommand("/start short")).toBeNull();
    expect(parseTelegramStartCommand("/start invalid token with spaces")).toBeNull();
  });
});

describe("verifyCronSecret", () => {
  it("accepts matching Bearer or x-cron-secret headers when CRON_SECRET is set", () => {
    const env = { NODE_ENV: "production", CRON_SECRET: "super-secret-cron" } as NodeJS.ProcessEnv;
    expect(
      verifyCronSecret(
        new Request("https://tendly.app/api/cron/reminders", {
          headers: { authorization: "Bearer super-secret-cron" },
        }),
        env,
      ),
    ).toEqual({ ok: true });

    expect(
      verifyCronSecret(
        new Request("https://tendly.app/api/cron/reminders", {
          headers: { "x-cron-secret": "super-secret-cron" },
        }),
        env,
      ),
    ).toEqual({ ok: true });

    expect(
      verifyCronSecret(
        new Request("https://tendly.app/api/cron/reminders", {
          headers: { authorization: "Bearer wrong" },
        }),
        env,
      ),
    ).toEqual({ ok: false, status: 401, error: "Unauthorized cron request." });
  });

  it("allows loopback dev calls when CRON_SECRET is unset and rejects non-loopback hosts", () => {
    const env = { NODE_ENV: "development" } as NodeJS.ProcessEnv;

    expect(
      verifyCronSecret(
        new Request("http://127.0.0.1:3000/api/cron/reminders", {
          headers: { authorization: "Bearer local-dev-token" },
        }),
        env,
      ),
    ).toEqual({ ok: true });

    expect(
      verifyCronSecret(new Request("http://localhost:3000/api/cron/reminders"), env),
    ).toEqual({ ok: false, status: 401, error: "Unauthorized cron request." });

    expect(
      verifyCronSecret(
        new Request("https://tendly.vercel.app/api/cron/reminders", {
          headers: { authorization: "Bearer anything" },
        }),
        env,
      ),
    ).toEqual({ ok: false, status: 503, error: "CRON_SECRET is not configured." });
  });
});

describe("verifyTelegramWebhookSecret", () => {
  it("allows requests when TELEGRAM_WEBHOOK_SECRET is unset and enforces constant-time match when set", () => {
    expect(
      verifyTelegramWebhookSecret(
        new Request("https://tendly.app/api/webhooks/telegram", { method: "POST" }),
        { NODE_ENV: "test" } as NodeJS.ProcessEnv,
      ),
    ).toBe(true);

    const env = {
      NODE_ENV: "production",
      TELEGRAM_WEBHOOK_SECRET: "tg-hook-secret",
    } as NodeJS.ProcessEnv;

    expect(
      verifyTelegramWebhookSecret(
        new Request("https://tendly.app/api/webhooks/telegram", {
          method: "POST",
          headers: { "x-telegram-bot-api-secret-token": "tg-hook-secret" },
        }),
        env,
      ),
    ).toBe(true);

    expect(
      verifyTelegramWebhookSecret(
        new Request("https://tendly.app/api/webhooks/telegram", {
          method: "POST",
          headers: { "x-telegram-bot-api-secret-token": "wrong-secret" },
        }),
        env,
      ),
    ).toBe(false);
  });
});

describe("sendTelegramMessage", () => {
  it("posts sendMessage payload to Telegram Bot API and reports errors cleanly", async () => {
    const okFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 }),
    );
    const okResult = await sendTelegramMessage({
      botToken: "123:ABC",
      chatId: 9001001,
      text: "Hello Barber",
      fetchImpl: okFetch as unknown as typeof fetch,
    });
    expect(okResult).toEqual({ ok: true });
    expect(okFetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bot123:ABC/sendMessage",
      expect.objectContaining({
        method: "POST",
      }),
    );

    const errFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, description: "Forbidden: bot blocked" }), {
        status: 403,
      }),
    );
    const errResult = await sendTelegramMessage({
      botToken: "123:ABC",
      chatId: 9001001,
      text: "Hello",
      fetchImpl: errFetch as unknown as typeof fetch,
    });
    expect(errResult).toEqual({ ok: false, error: "Forbidden: bot blocked" });
  });
});

describe("drainNotificationOutbox", () => {
  function createFakeOutboxSupabase(
    rows: Array<{
      id: string;
      telegram_chat_id: number;
      message_text: string;
      attempt_count: number;
    }>,
  ) {
    const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];
    const client = {
      from(table: string) {
        expect(table).toBe("notification_outbox");
        return {
          select() {
            return {
              eq() {
                return {
                  lte() {
                    return {
                      order() {
                        return {
                          limit: async () => ({ data: rows, error: null }),
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            return {
              eq: async (_col: string, id: string) => {
                updates.push({ id, payload });
                return { error: null };
              },
            };
          },
        };
      },
    };
    return { client, updates };
  }

  it("marks pending rows as sent in dry-run mode when TELEGRAM_BOT_TOKEN is absent", async () => {
    const { client, updates } = createFakeOutboxSupabase([
      {
        id: "n-1",
        telegram_chat_id: 9001001,
        message_text: "New booking",
        attempt_count: 0,
      },
    ]);

    const summary = await drainNotificationOutbox({
      supabase: client as never,
      botToken: null,
    });

    expect(summary).toEqual({ processed: 1, sent: 1, failed: 0 });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      id: "n-1",
      payload: expect.objectContaining({
        status: "sent",
        attempt_count: 1,
        last_error: null,
      }),
    });
  });

  it("records mixed sent and failed statuses when Telegram API rejects one message", async () => {
    const { client, updates } = createFakeOutboxSupabase([
      {
        id: "n-ok",
        telegram_chat_id: 9001001,
        message_text: "First",
        attempt_count: 0,
      },
      {
        id: "n-fail",
        telegram_chat_id: 9001002,
        message_text: "Second",
        attempt_count: 1,
      },
    ]);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, description: "chat not found" }), { status: 400 }),
      );

    const summary = await drainNotificationOutbox({
      supabase: client as never,
      botToken: "123:XYZ",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(summary).toEqual({ processed: 2, sent: 1, failed: 1 });
    expect(updates[0].payload).toMatchObject({ status: "sent", attempt_count: 1, last_error: null });
    expect(updates[1].payload).toMatchObject({
      status: "failed",
      attempt_count: 2,
      last_error: "chat not found",
    });
  });
});
