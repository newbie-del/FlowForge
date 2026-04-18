import "server-only";

import { google } from "googleapis";
import { decrypt } from "@/lib/encryption";

const GOOGLE_SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
] as const;

export type GoogleSheetsAuthType = "service_account" | "oauth";

export type GoogleSheetsCredentialValue = {
  authType: GoogleSheetsAuthType;
  serviceAccountJson?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  redirectUri?: string;
};

export type GoogleSpreadsheetOption = {
  id: string;
  name: string;
};

export type GoogleSheetOption = {
  sheetId: number;
  title: string;
};

export function parseGoogleSheetsCredentialValue(
  encryptedValue: string,
): GoogleSheetsCredentialValue {
  const decrypted = decrypt(encryptedValue);

  let parsed: unknown;
  try {
    parsed = JSON.parse(decrypted);
  } catch {
    throw new Error(
      "Google Sheets credential is malformed. Please update this credential.",
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(
      "Google Sheets credential is malformed. Please update this credential.",
    );
  }

  const record = parsed as Record<string, unknown>;
  const authType = String(record.authType ?? "") as GoogleSheetsAuthType;

  if (authType !== "service_account" && authType !== "oauth") {
    throw new Error("Google Sheets credential auth type is invalid.");
  }

  return {
    authType,
    serviceAccountJson:
      typeof record.serviceAccountJson === "string"
        ? record.serviceAccountJson
        : undefined,
    clientId: typeof record.clientId === "string" ? record.clientId : undefined,
    clientSecret:
      typeof record.clientSecret === "string" ? record.clientSecret : undefined,
    refreshToken:
      typeof record.refreshToken === "string" ? record.refreshToken : undefined,
    redirectUri:
      typeof record.redirectUri === "string" ? record.redirectUri : undefined,
  };
}

async function createGoogleAuthFromCredential(
  credential: GoogleSheetsCredentialValue,
) {
  if (credential.authType === "service_account") {
    if (!credential.serviceAccountJson?.trim()) {
      throw new Error("Service account JSON is required.");
    }

    let credentialsPayload: unknown;
    try {
      credentialsPayload = JSON.parse(credential.serviceAccountJson);
    } catch {
      throw new Error("Service account JSON is invalid.");
    }

    const auth = new google.auth.GoogleAuth({
      credentials: credentialsPayload as Record<string, unknown>,
      scopes: [...GOOGLE_SHEETS_SCOPES],
    });

    return auth.getClient();
  }

  if (
    !credential.clientId?.trim() ||
    !credential.clientSecret?.trim() ||
    !credential.refreshToken?.trim()
  ) {
    throw new Error(
      "OAuth credentials are incomplete. Client ID, secret, and refresh token are required.",
    );
  }

  const oAuth2Client = new google.auth.OAuth2(
    credential.clientId,
    credential.clientSecret,
    credential.redirectUri?.trim() || "urn:ietf:wg:oauth:2.0:oob",
  );

  oAuth2Client.setCredentials({
    refresh_token: credential.refreshToken,
  });

  return oAuth2Client;
}

export async function createGoogleSheetsClients(
  encryptedCredentialValue: string,
) {
  const credential = parseGoogleSheetsCredentialValue(encryptedCredentialValue);
  const auth = await createGoogleAuthFromCredential(credential);

  const sheets = google.sheets({
    version: "v4",
    auth,
  });
  const drive = google.drive({
    version: "v3",
    auth,
  });

  return {
    sheets,
    drive,
    credential,
  };
}

export async function listGoogleSpreadsheets(encryptedCredentialValue: string) {
  const { drive } = await createGoogleSheetsClients(encryptedCredentialValue);

  const response = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    pageSize: 100,
    fields: "files(id,name)",
    orderBy: "modifiedTime desc",
  });

  return (
    response.data.files?.map((file) => ({
      id: file.id || "",
      name: file.name || "Untitled Spreadsheet",
    })) || []
  ).filter((file): file is GoogleSpreadsheetOption => Boolean(file.id));
}

export async function listGoogleSheetsTabs(
  encryptedCredentialValue: string,
  spreadsheetId: string,
) {
  const { sheets } = await createGoogleSheetsClients(encryptedCredentialValue);

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });

  return (
    response.data.sheets?.map((sheet) => ({
      sheetId: sheet.properties?.sheetId ?? 0,
      title: sheet.properties?.title ?? "Sheet1",
    })) || []
  ).filter((sheet): sheet is GoogleSheetOption =>
    Number.isFinite(sheet.sheetId),
  );
}

export async function testGoogleSheetsConnection(
  encryptedCredentialValue: string,
  spreadsheetId?: string,
) {
  const { drive, sheets } = await createGoogleSheetsClients(
    encryptedCredentialValue,
  );

  if (spreadsheetId?.trim()) {
    await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId.trim(),
      fields: "spreadsheetId,properties(title)",
    });
    return;
  }

  await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    pageSize: 1,
    fields: "files(id)",
  });
}

export function mapGoogleSheetsError(error: unknown): string {
  const status =
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : undefined;

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown Google Sheets error";

  if (status === 401) {
    return "Invalid Google credentials. Reconnect your credential.";
  }
  if (status === 403) {
    return "Permission denied. Share the spreadsheet with the service account email.";
  }
  if (status === 404) {
    return "Spreadsheet or sheet not found.";
  }
  if (status === 429) {
    return "Google Sheets quota exceeded. Please retry later.";
  }
  if (message.toLowerCase().includes("unable to parse range")) {
    return "Invalid A1 range format.";
  }
  if (message.toLowerCase().includes("service account json is invalid")) {
    return "Service account JSON is invalid.";
  }
  if (message.toLowerCase().includes("network")) {
    return "Network issue while contacting Google Sheets.";
  }

  return `Google Sheets error: ${message}`;
}

export function toColumnLetter(columnNumber: number): string {
  let value = columnNumber;
  let column = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    value = Math.floor((value - 1) / 26);
  }
  return column || "A";
}
