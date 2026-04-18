"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { headers } from "next/headers";
import { CredentialType } from "@/generated/prisma";
import { googleSheetsChannel } from "@/inngest/channels/google-sheets";
import { inngest } from "@/inngest/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import {
  createGoogleSheetsClients,
  listGoogleSheetsTabs,
  listGoogleSpreadsheets,
  mapGoogleSheetsError,
  testGoogleSheetsConnection,
} from "./google-sheets";

type PreviewRowsInput = {
  credentialId: string;
  spreadsheetId: string;
  sheetName: string;
  range?: string;
  useFirstRowAsHeaders?: boolean;
  limitRows?: number;
};

export type GoogleSheetsToken = Realtime.Token<
  typeof googleSheetsChannel,
  ["status"]
>;

async function requireGoogleSheetsCredential(credentialId: string) {
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
      type: CredentialType.GOOGLE_SHEETS,
    },
  });

  if (!credential) {
    throw new Error("Google Sheets credential not found.");
  }

  return credential;
}

export async function fetchGoogleSheetsRealtimeToken(): Promise<GoogleSheetsToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: googleSheetsChannel(),
    topics: ["status"],
  });

  return token;
}

export async function testGoogleSheetsNodeConnection(input: {
  credentialId: string;
  spreadsheetId?: string;
}) {
  try {
    const credential = await requireGoogleSheetsCredential(input.credentialId);
    await testGoogleSheetsConnection(credential.value, input.spreadsheetId);

    return {
      success: true as const,
      message: "Google Sheets connection successful.",
    };
  } catch (error) {
    return {
      success: false as const,
      message: mapGoogleSheetsError(error),
    };
  }
}

export async function listGoogleSheetsSpreadsheets(input: {
  credentialId: string;
}) {
  try {
    const credential = await requireGoogleSheetsCredential(input.credentialId);
    const spreadsheets = await listGoogleSpreadsheets(credential.value);
    return {
      success: true as const,
      spreadsheets,
    };
  } catch (error) {
    return {
      success: false as const,
      message: mapGoogleSheetsError(error),
      spreadsheets: [],
    };
  }
}

export async function listGoogleSheetsTabsAction(input: {
  credentialId: string;
  spreadsheetId: string;
}) {
  try {
    const credential = await requireGoogleSheetsCredential(input.credentialId);
    const sheets = await listGoogleSheetsTabs(
      credential.value,
      input.spreadsheetId,
    );

    return {
      success: true as const,
      sheets,
    };
  } catch (error) {
    return {
      success: false as const,
      message: mapGoogleSheetsError(error),
      sheets: [],
    };
  }
}

export async function previewGoogleSheetsData(input: PreviewRowsInput) {
  try {
    const credential = await requireGoogleSheetsCredential(input.credentialId);
    const { sheets } = await createGoogleSheetsClients(credential.value);

    const range = input.range?.trim() || "A:ZZ";
    const a1Range = `${input.sheetName}!${range}`;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: input.spreadsheetId,
      range: a1Range,
    });

    const values = response.data.values ?? [];
    if (values.length === 0) {
      return {
        success: true as const,
        rows: [],
      };
    }

    const limit = input.limitRows && input.limitRows > 0 ? input.limitRows : 10;
    const useHeaders = input.useFirstRowAsHeaders ?? true;

    if (!useHeaders) {
      return {
        success: true as const,
        rows: values.slice(0, limit),
      };
    }

    const [headerRow, ...dataRows] = values;
    const headers = headerRow ?? [];

    const rows = dataRows.slice(0, limit).map((row) => {
      const mapped: Record<string, string> = {};
      headers.forEach((header, index) => {
        mapped[String(header)] = String(row[index] ?? "");
      });
      return mapped;
    });

    return {
      success: true as const,
      rows,
    };
  } catch (error) {
    return {
      success: false as const,
      rows: [],
      message: mapGoogleSheetsError(error),
    };
  }
}
