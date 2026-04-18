import "server-only";

import nodemailer, { type Transporter } from "nodemailer";
import { decrypt } from "@/lib/encryption";

export const SMTP_PROVIDERS = ["gmail", "outlook", "custom"] as const;
export type SmtpProvider = (typeof SMTP_PROVIDERS)[number];

export interface SmtpCredentialValue {
  emailAddress: string;
  smtpUsername: string;
  smtpPassword: string;
  host?: string;
  port?: number;
  secure?: boolean;
}

export interface ResolvedSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

type BuildTransporterParams = {
  encryptedCredentialValue: string;
  provider: SmtpProvider;
  customHost?: string;
  customPort?: number;
  customSecure?: boolean;
};

export function parseSmtpCredentialValue(
  encryptedValue: string,
): SmtpCredentialValue {
  const decrypted = decrypt(encryptedValue);

  let parsed: unknown;
  try {
    parsed = JSON.parse(decrypted);
  } catch {
    throw new Error(
      "SMTP credential is malformed. Please update this credential.",
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(
      "SMTP credential is malformed. Please update this credential.",
    );
  }

  const record = parsed as Record<string, unknown>;
  const emailAddress = String(record.emailAddress ?? "").trim();
  const smtpUsername = String(record.smtpUsername ?? "").trim();
  const smtpPassword = String(record.smtpPassword ?? "");
  const host = String(record.host ?? "").trim();
  const portValue = record.port;
  const secureValue = record.secure;

  const port =
    typeof portValue === "number"
      ? portValue
      : Number.isFinite(Number(portValue))
        ? Number(portValue)
        : undefined;
  const secure =
    typeof secureValue === "boolean"
      ? secureValue
      : String(secureValue).toLowerCase() === "true";

  if (!emailAddress || !smtpUsername || !smtpPassword) {
    throw new Error(
      "SMTP credential is incomplete. Please add sender and login details.",
    );
  }

  return {
    emailAddress,
    smtpUsername,
    smtpPassword,
    host: host || undefined,
    port,
    secure,
  };
}

export function resolveSmtpConfig(
  credential: SmtpCredentialValue,
  provider: SmtpProvider,
  customHost?: string,
  customPort?: number,
  customSecure?: boolean,
): ResolvedSmtpConfig {
  if (provider === "gmail") {
    return {
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: credential.smtpUsername,
        pass: credential.smtpPassword,
      },
    };
  }

  if (provider === "outlook") {
    return {
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: {
        user: credential.smtpUsername,
        pass: credential.smtpPassword,
      },
    };
  }

  const host = customHost?.trim() || credential.host;
  const port = customPort ?? credential.port;
  const secure = customSecure ?? credential.secure ?? false;

  if (!host || !port) {
    throw new Error("Custom SMTP requires host and port.");
  }

  return {
    host,
    port,
    secure,
    auth: {
      user: credential.smtpUsername,
      pass: credential.smtpPassword,
    },
  };
}

export function buildSmtpTransporter({
  encryptedCredentialValue,
  provider,
  customHost,
  customPort,
  customSecure,
}: BuildTransporterParams): {
  transporter: Transporter;
  credential: SmtpCredentialValue;
} {
  const credential = parseSmtpCredentialValue(encryptedCredentialValue);
  const config = resolveSmtpConfig(
    credential,
    provider,
    customHost,
    customPort,
    customSecure,
  );

  return {
    transporter: nodemailer.createTransport(config),
    credential,
  };
}

export function mapEmailError(error: unknown): string {
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";
  const responseCode =
    error &&
    typeof error === "object" &&
    "responseCode" in error &&
    typeof (error as { responseCode?: unknown }).responseCode === "number"
      ? (error as { responseCode: number }).responseCode
      : undefined;

  if (code === "EAUTH" || responseCode === 535) {
    return "SMTP authentication failed. Check username/password or app password.";
  }
  if (code === "ETIMEDOUT") {
    return "SMTP server timed out. Check host/port and network access.";
  }
  if (code === "ECONNECTION") {
    return "Could not connect to SMTP server. Verify host, port, and TLS settings.";
  }
  if (code === "EENVELOPE") {
    return "Invalid recipient email address.";
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return "SMTP host is unreachable. Check network or DNS settings.";
  }

  return "Failed to send email due to an SMTP/network error.";
}
