"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { headers } from "next/headers";
import { CredentialType } from "@/generated/prisma";
import { emailChannel } from "@/inngest/channels/email";
import { inngest } from "@/inngest/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { buildSmtpTransporter, mapEmailError, type SmtpProvider } from "./smtp";

type EmailActionInput = {
  provider: SmtpProvider;
  credentialId: string;
  fromEmail?: string;
  toEmail?: string;
  subject?: string;
  messageBody?: string;
  htmlMode?: boolean;
  customHost?: string;
  customPort?: number;
  customSecure?: boolean;
};

export type EmailToken = Realtime.Token<typeof emailChannel, ["status"]>;

export async function fetchEmailRealtimeToken(): Promise<EmailToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: emailChannel(),
    topics: ["status"],
  });

  return token;
}

async function requireSmtpCredential(credentialId: string) {
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
      type: CredentialType.SMTP,
    },
  });

  if (!credential) {
    throw new Error("SMTP credential not found.");
  }

  return credential;
}

export async function testEmailConnection(input: EmailActionInput) {
  const credential = await requireSmtpCredential(input.credentialId);

  try {
    const { transporter } = buildSmtpTransporter({
      encryptedCredentialValue: credential.value,
      provider: input.provider,
      customHost: input.customHost,
      customPort: input.customPort,
      customSecure: input.customSecure,
    });

    await transporter.verify();
    return { success: true as const, message: "SMTP connection successful." };
  } catch (error) {
    return {
      success: false as const,
      message: mapEmailError(error),
    };
  }
}

export async function sendEmailNodeTest(input: EmailActionInput) {
  if (!input.fromEmail?.trim()) {
    return { success: false as const, message: "From Email is required." };
  }
  if (!input.toEmail?.trim()) {
    return { success: false as const, message: "To Email is required." };
  }

  const credential = await requireSmtpCredential(input.credentialId);

  try {
    const { transporter } = buildSmtpTransporter({
      encryptedCredentialValue: credential.value,
      provider: input.provider,
      customHost: input.customHost,
      customPort: input.customPort,
      customSecure: input.customSecure,
    });

    const info = await transporter.sendMail({
      from: input.fromEmail.trim(),
      to: input.toEmail.trim(),
      subject: input.subject?.trim() || "FlowForge Email Node test",
      text: input.htmlMode
        ? undefined
        : input.messageBody?.trim() || "Email node test message",
      html: input.htmlMode
        ? input.messageBody?.trim() || "<p>Email node test message</p>"
        : undefined,
    });

    return {
      success: true as const,
      message: "Test email sent.",
      messageId: info.messageId,
    };
  } catch (error) {
    return {
      success: false as const,
      message: mapEmailError(error),
    };
  }
}
