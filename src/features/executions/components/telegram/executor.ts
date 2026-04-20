import Handlebars from "handlebars";
import { decode } from "html-entities";
import { NonRetriableError } from "inngest";
import ky from "ky";
import type { NodeExecutor } from "@/features/executions/types";
import { CredentialType } from "@/generated/prisma";
import { telegramChannel } from "@/inngest/channels/telegram";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  const safeString = new Handlebars.SafeString(jsonString);
  return safeString;
});

type TelegramData = {
  variableName?: string;
  credentialId?: string;
  chatId?: string;
  message?: string;
  parseMode?: "plain" | "markdown" | "html";
  operation?: "send_message" | "send_photo" | "send_document";
  photoUrl?: string;
  documentUrl?: string;
  photoSource?: "url" | "upload" | "previous_node";
  documentSource?: "url" | "upload" | "previous_node";
  photoFileName?: string;
  photoMimeType?: string;
  photoBase64?: string;
  photoBinaryTemplate?: string;
  documentFileName?: string;
  documentMimeType?: string;
  documentBase64?: string;
  documentBinaryTemplate?: string;
  disableNotification?: boolean;
};

type FilePayload =
  | { kind: "url"; url: string }
  | { kind: "binary"; fileName: string; mimeType: string; content: Buffer };

const TELEGRAM_API_BASE = "https://api.telegram.org";

function resolveTemplate(
  template: string | undefined,
  context: Record<string, unknown>,
) {
  if (!template) {
    return "";
  }
  return decode(Handlebars.compile(template)(context)).trim();
}

function parseModeToTelegram(parseMode: "plain" | "markdown" | "html") {
  if (parseMode === "markdown") {
    return "Markdown";
  }
  if (parseMode === "html") {
    return "HTML";
  }
  return undefined;
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function parseDataUrl(value: string) {
  const match = value.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;

  return {
    mimeType: match[1] || "application/octet-stream",
    base64: match[2] || "",
  };
}

function decodeBase64(base64: string) {
  try {
    return Buffer.from(base64, "base64");
  } catch {
    throw new NonRetriableError("Invalid base64 file content.");
  }
}

function filePayloadFromObject(
  value: Record<string, unknown>,
  fallbackFileName: string,
  fallbackMimeType: string,
): FilePayload | null {
  const urlCandidate = [
    value.url,
    value.fileUrl,
    value.photoUrl,
    value.documentUrl,
  ].find((entry) => typeof entry === "string" && isHttpUrl(entry));

  if (typeof urlCandidate === "string") {
    return { kind: "url", url: urlCandidate };
  }

  const nested = [value.binary, value.file, value.photo, value.document].find(
    (entry) => entry && typeof entry === "object",
  );
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return filePayloadFromObject(
      nested as Record<string, unknown>,
      fallbackFileName,
      fallbackMimeType,
    );
  }

  const base64Candidate = [
    value.base64,
    value.data,
    value.contentBase64,
    value.content,
  ].find((entry) => typeof entry === "string" && entry.trim().length > 0);

  if (typeof base64Candidate !== "string") {
    return null;
  }

  const fileNameCandidate = [value.fileName, value.filename, value.name].find(
    (entry) => typeof entry === "string" && entry.trim().length > 0,
  );

  const mimeTypeCandidate = [
    value.mimeType,
    value.contentType,
    value.type,
  ].find((entry) => typeof entry === "string" && entry.trim().length > 0);

  return {
    kind: "binary",
    fileName:
      typeof fileNameCandidate === "string"
        ? fileNameCandidate
        : fallbackFileName,
    mimeType:
      typeof mimeTypeCandidate === "string"
        ? mimeTypeCandidate
        : fallbackMimeType,
    content: decodeBase64(base64Candidate),
  };
}

function filePayloadFromTemplate(
  raw: string,
  fallbackFileName: string,
  fallbackMimeType: string,
): FilePayload | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (isHttpUrl(trimmed)) {
    return { kind: "url", url: trimmed };
  }

  const dataUrl = parseDataUrl(trimmed);
  if (dataUrl) {
    return {
      kind: "binary",
      fileName: fallbackFileName,
      mimeType: dataUrl.mimeType,
      content: decodeBase64(dataUrl.base64),
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return filePayloadFromObject(
        parsed as Record<string, unknown>,
        fallbackFileName,
        fallbackMimeType,
      );
    }
  } catch {
    // not JSON, continue
  }

  if (trimmed.length >= 16) {
    return {
      kind: "binary",
      fileName: fallbackFileName,
      mimeType: fallbackMimeType,
      content: decodeBase64(trimmed),
    };
  }

  return null;
}

async function telegramRequest(
  botToken: string,
  method: "sendMessage" | "sendPhoto" | "sendDocument",
  payload: Record<string, unknown> | FormData,
) {
  const response = await ky.post(
    `${TELEGRAM_API_BASE}/bot${botToken}/${method}`,
    {
      ...(payload instanceof FormData ? { body: payload } : { json: payload }),
      timeout: 10000,
    },
  );

  const result = (await response.json()) as Record<string, unknown>;
  if (!result.ok) {
    throw new NonRetriableError(
      `Telegram API error: ${(result.description as string) || "Unknown error"}`,
    );
  }
  return result;
}

function addCaptionAndParseMode(
  payload: Record<string, unknown>,
  caption: string | undefined,
  parseMode: "plain" | "markdown" | "html",
) {
  if (!caption?.trim()) return;
  payload.caption = caption;
  const telegramParseMode = parseModeToTelegram(parseMode);
  if (telegramParseMode) {
    payload.parse_mode = telegramParseMode;
  }
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  message: string,
  parseMode: "plain" | "markdown" | "html",
  disableNotification: boolean,
) {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: message,
    disable_notification: disableNotification,
  };

  const telegramParseMode = parseModeToTelegram(parseMode);
  if (telegramParseMode) {
    payload.parse_mode = telegramParseMode;
  }

  return telegramRequest(botToken, "sendMessage", payload);
}

async function sendTelegramMedia(params: {
  botToken: string;
  chatId: string;
  operation: "send_photo" | "send_document";
  payload: FilePayload;
  caption?: string;
  parseMode: "plain" | "markdown" | "html";
  disableNotification: boolean;
}) {
  const method =
    params.operation === "send_photo" ? "sendPhoto" : "sendDocument";
  const mediaField = params.operation === "send_photo" ? "photo" : "document";

  if (params.payload.kind === "url") {
    const jsonPayload: Record<string, unknown> = {
      chat_id: params.chatId,
      [mediaField]: params.payload.url,
      disable_notification: params.disableNotification,
    };
    addCaptionAndParseMode(jsonPayload, params.caption, params.parseMode);
    return telegramRequest(params.botToken, method, jsonPayload);
  }

  const formData = new FormData();
  formData.set("chat_id", params.chatId);
  formData.set("disable_notification", String(params.disableNotification));
  if (params.caption?.trim()) {
    formData.set("caption", params.caption);
    const telegramParseMode = parseModeToTelegram(params.parseMode);
    if (telegramParseMode) {
      formData.set("parse_mode", telegramParseMode);
    }
  }

  const blob = new Blob([Uint8Array.from(params.payload.content)], {
    type: params.payload.mimeType || "application/octet-stream",
  });
  formData.set(mediaField, blob, params.payload.fileName);

  return telegramRequest(params.botToken, method, formData);
}

export const telegramExecutor: NodeExecutor<TelegramData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(
    telegramChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  const failure = async (message: string) => {
    await publish(
      telegramChannel().status({
        nodeId,
        status: "error",
      }),
    );

    return {
      ...context,
      [data.variableName || "telegram"]: {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      },
    };
  };

  try {
    if (!data.variableName) {
      return failure("Variable name is required.");
    }
    if (!data.credentialId) {
      return failure("Telegram credential is required.");
    }
    if (!data.chatId) {
      return failure("Chat ID is required.");
    }

    const operation = data.operation || "send_message";
    const parseMode =
      (data.parseMode as "plain" | "markdown" | "html") || "plain";
    const disableNotification = Boolean(data.disableNotification);
    const resolvedChatId = resolveTemplate(data.chatId, context);

    if (!resolvedChatId) {
      return failure("Chat ID cannot be empty.");
    }
    if (!/^-?\d+$/.test(resolvedChatId) && !resolvedChatId.startsWith("@")) {
      return failure("Chat ID must be numeric or start with @.");
    }

    const credential = await step.run(
      `get-telegram-credential-${nodeId}`,
      async () => {
        return prisma.credential.findUnique({
          where: {
            id: data.credentialId,
            userId,
            type: CredentialType.TELEGRAM_BOT,
          },
        });
      },
    );

    if (!credential) {
      return failure("Telegram credential not found or incorrect type.");
    }

    const botToken = decrypt(credential.value);
    const resolvedMessage = data.message
      ? resolveTemplate(data.message, context)
      : undefined;

    const result = await step.run(`send-telegram-${nodeId}`, async () => {
      if (operation === "send_message") {
        if (!resolvedMessage?.trim()) {
          throw new NonRetriableError("Message is required for send_message.");
        }
        return sendTelegramMessage(
          botToken,
          resolvedChatId,
          resolvedMessage,
          parseMode,
          disableNotification,
        );
      }

      if (operation === "send_photo") {
        const source = data.photoSource || "url";
        let payload: FilePayload | null = null;

        if (source === "url") {
          const photoUrl = resolveTemplate(data.photoUrl, context);
          if (!photoUrl) {
            throw new NonRetriableError("Photo URL is required.");
          }
          payload = { kind: "url", url: photoUrl };
        } else if (source === "upload") {
          if (!data.photoBase64) {
            throw new NonRetriableError("Uploaded photo is missing.");
          }
          payload = {
            kind: "binary",
            fileName: data.photoFileName || "photo.jpg",
            mimeType: data.photoMimeType || "image/jpeg",
            content: decodeBase64(data.photoBase64),
          };
        } else {
          const resolvedPrevious = resolveTemplate(
            data.photoBinaryTemplate,
            context,
          );
          payload = filePayloadFromTemplate(
            resolvedPrevious,
            data.photoFileName || "photo.jpg",
            data.photoMimeType || "image/jpeg",
          );
        }

        if (!payload) {
          throw new NonRetriableError("Photo payload is invalid or empty.");
        }

        return sendTelegramMedia({
          botToken,
          chatId: resolvedChatId,
          operation,
          payload,
          caption: resolvedMessage,
          parseMode,
          disableNotification,
        });
      }

      const source = data.documentSource || "url";
      let payload: FilePayload | null = null;

      if (source === "url") {
        const documentUrl = resolveTemplate(data.documentUrl, context);
        if (!documentUrl) {
          throw new NonRetriableError("Document URL is required.");
        }
        payload = { kind: "url", url: documentUrl };
      } else if (source === "upload") {
        if (!data.documentBase64) {
          throw new NonRetriableError("Uploaded document is missing.");
        }
        payload = {
          kind: "binary",
          fileName: data.documentFileName || "document.pdf",
          mimeType: data.documentMimeType || "application/octet-stream",
          content: decodeBase64(data.documentBase64),
        };
      } else {
        const resolvedPrevious = resolveTemplate(
          data.documentBinaryTemplate,
          context,
        );
        payload = filePayloadFromTemplate(
          resolvedPrevious,
          data.documentFileName || "document.pdf",
          data.documentMimeType || "application/octet-stream",
        );
      }

      if (!payload) {
        throw new NonRetriableError("Document payload is invalid or empty.");
      }

      return sendTelegramMedia({
        botToken,
        chatId: resolvedChatId,
        operation: "send_document",
        payload,
        caption: resolvedMessage,
        parseMode,
        disableNotification,
      });
    });

    await publish(
      telegramChannel().status({
        nodeId,
        status: "success",
      }),
    );

    const resultData = result as Record<string, unknown>;
    const messageResult = resultData.result as Record<string, unknown>;

    return {
      ...context,
      [data.variableName]: {
        success: true,
        messageId: messageResult?.message_id,
        chatId: resolvedChatId,
        timestamp: new Date().toISOString(),
        operation,
      },
    };
  } catch (error) {
    if (error instanceof NonRetriableError) {
      return failure(error.message);
    }

    return failure(
      error instanceof Error ? error.message : "Unknown error occurred.",
    );
  }
};
