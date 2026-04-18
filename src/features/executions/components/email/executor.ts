import Handlebars from "handlebars";
import { decode } from "html-entities";
import { NonRetriableError } from "inngest";
import type Mail from "nodemailer/lib/mailer";
import type { NodeExecutor } from "@/features/executions/types";
import { CredentialType } from "@/generated/prisma";
import { emailChannel } from "@/inngest/channels/email";
import prisma from "@/lib/db";
import {
  buildSmtpTransporter,
  mapEmailError,
  SMTP_PROVIDERS,
  type SmtpProvider,
} from "./smtp";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  const safeString = new Handlebars.SafeString(jsonString);

  return safeString;
});

type EmailData = {
  fromEmail?: string;
  toEmail?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  messageBody?: string;
  htmlMode?: boolean;
  attachmentsJson?: string;
  provider?: SmtpProvider;
  credentialId?: string;
  customHost?: string;
  customPort?: number;
  customSecure?: boolean;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resolveTemplate(
  template: string | undefined,
  context: Record<string, unknown>,
) {
  if (!template) {
    return "";
  }

  return decode(Handlebars.compile(template)(context)).trim();
}

function splitRecipients(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function validateRecipients(label: string, values: string[]) {
  for (const value of values) {
    if (!EMAIL_REGEX.test(value)) {
      throw new NonRetriableError(
        `Email node: ${label} contains invalid email "${value}".`,
      );
    }
  }
}

export const emailExecutor: NodeExecutor<EmailData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(
    emailChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  const failure = async (message: string) => {
    await publish(
      emailChannel().status({
        nodeId,
        status: "error",
      }),
    );

    return {
      ...context,
      email: {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      },
    };
  };

  const provider = data.provider ?? "gmail";
  if (!SMTP_PROVIDERS.includes(provider)) {
    return failure("Invalid SMTP provider selected.");
  }

  if (!data.credentialId) {
    return failure("Credential is required.");
  }

  const credential = await step.run("get-email-credential", async () => {
    return prisma.credential.findUnique({
      where: {
        id: data.credentialId,
        userId,
        type: CredentialType.SMTP,
      },
    });
  });

  if (!credential) {
    return failure("SMTP credential not found.");
  }

  const fromEmail = resolveTemplate(data.fromEmail, context);
  const toRecipients = splitRecipients(resolveTemplate(data.toEmail, context));
  const ccRecipients = splitRecipients(resolveTemplate(data.cc, context));
  const bccRecipients = splitRecipients(resolveTemplate(data.bcc, context));
  const subject = resolveTemplate(data.subject, context);
  const messageBody = resolveTemplate(data.messageBody, context);

  if (!fromEmail) {
    return failure("From Email is required.");
  }
  if (!EMAIL_REGEX.test(fromEmail)) {
    return failure("From Email is invalid.");
  }
  if (toRecipients.length === 0) {
    return failure("At least one To Email recipient is required.");
  }
  try {
    validateRecipients("To Email", toRecipients);
    validateRecipients("CC", ccRecipients);
    validateRecipients("BCC", bccRecipients);
  } catch (error) {
    if (error instanceof NonRetriableError) {
      return failure(error.message.replace("Email node: ", ""));
    }
    return failure("Invalid recipient email.");
  }

  const customHost = resolveTemplate(data.customHost, context);
  const customPort =
    data.customPort && Number.isFinite(Number(data.customPort))
      ? Number(data.customPort)
      : undefined;
  const customSecure = data.customSecure;

  let attachments: Mail.Attachment[] | undefined;
  if (data.attachmentsJson?.trim()) {
    try {
      const resolved = resolveTemplate(data.attachmentsJson, context);
      const parsed = JSON.parse(resolved);

      if (!Array.isArray(parsed)) {
        throw new Error("Attachments must be a JSON array.");
      }
      attachments = parsed as Mail.Attachment[];
    } catch {
      return failure("Attachments JSON is invalid.");
    }
  }

  try {
    const result = await step.run("send-email", async () => {
      const { transporter } = buildSmtpTransporter({
        encryptedCredentialValue: credential.value,
        provider,
        customHost,
        customPort,
        customSecure,
      });

      const info = await transporter.sendMail({
        from: fromEmail,
        to: toRecipients,
        cc: ccRecipients.length ? ccRecipients : undefined,
        bcc: bccRecipients.length ? bccRecipients : undefined,
        subject: subject || "No subject",
        text: data.htmlMode ? undefined : messageBody,
        html: data.htmlMode ? messageBody : undefined,
        attachments,
      });

      return {
        success: true,
        messageId: info.messageId,
        recipient: toRecipients.join(", "),
        timestamp: new Date().toISOString(),
      };
    });

    await publish(
      emailChannel().status({
        nodeId,
        status: "success",
      }),
    );

    return {
      ...context,
      email: result,
    };
  } catch (error) {
    return failure(mapEmailError(error));
  }
};
