"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import ky from "ky";
import { headers } from "next/headers";
import { CredentialType } from "@/generated/prisma";
import { telegramChannel } from "@/inngest/channels/telegram";
import { inngest } from "@/inngest/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

export type TelegramToken = Realtime.Token<typeof telegramChannel, ["status"]>;

export async function fetchTelegramRealtimeToken(): Promise<TelegramToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: telegramChannel(),
    topics: ["status"],
  });

  return token;
}

const TELEGRAM_API_BASE = "https://api.telegram.org";

type TelegramNodeTestInput = {
  credentialId: string;
  chatId: string;
  message: string;
  parseMode?: "plain" | "markdown" | "html";
  disableNotification?: boolean;
};

async function requireTelegramCredential(credentialId: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    throw new Error("You must be logged in.");
  }

  const credential = await prisma.credential.findUnique({
    where: {
      id: credentialId,
      userId: session.user.id,
      type: CredentialType.TELEGRAM_BOT,
    },
  });

  if (!credential) {
    throw new Error("Telegram credential not found.");
  }

  return credential;
}

export async function sendTelegramNodeTest(input: TelegramNodeTestInput) {
  if (!input.credentialId?.trim()) {
    return {
      success: false as const,
      message: "Telegram credential is required.",
    };
  }

  if (!input.chatId?.trim()) {
    return { success: false as const, message: "Chat ID is required." };
  }

  if (!input.message?.trim()) {
    return {
      success: false as const,
      message: "Message is required for test send.",
    };
  }

  if (
    !/^-?\d+$/.test(input.chatId.trim()) &&
    !input.chatId.trim().startsWith("@")
  ) {
    return {
      success: false as const,
      message: "Chat ID must be numeric or start with @.",
    };
  }

  try {
    const credential = await requireTelegramCredential(input.credentialId);
    const botToken = decrypt(credential.value);

    const payload: Record<string, unknown> = {
      chat_id: input.chatId.trim(),
      text: input.message.trim(),
      disable_notification: Boolean(input.disableNotification),
    };

    if (input.parseMode && input.parseMode !== "plain") {
      payload.parse_mode = input.parseMode === "markdown" ? "Markdown" : "HTML";
    }

    const response = await ky.post(
      `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`,
      {
        json: payload,
        timeout: 10000,
      },
    );

    const result = (await response.json()) as Record<string, unknown>;
    if (!result.ok) {
      return {
        success: false as const,
        message: String(
          result.description ?? "Telegram API rejected test message.",
        ),
      };
    }

    return {
      success: true as const,
      message: "Test message sent successfully.",
    };
  } catch (error) {
    return {
      success: false as const,
      message:
        error instanceof Error
          ? error.message
          : "Failed to send Telegram test message.",
    };
  }
}
