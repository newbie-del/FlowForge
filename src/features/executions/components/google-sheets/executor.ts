import Handlebars from "handlebars";
import { decode } from "html-entities";
import type { NodeExecutor } from "@/features/executions/types";
import { CredentialType } from "@/generated/prisma";
import { googleSheetsChannel } from "@/inngest/channels/google-sheets";
import prisma from "@/lib/db";
import {
  createGoogleSheetsClients,
  mapGoogleSheetsError,
  toColumnLetter,
} from "./google-sheets";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  const safeString = new Handlebars.SafeString(jsonString);
  return safeString;
});

type GoogleSheetsOperation =
  | "read_rows"
  | "append_row"
  | "update_row"
  | "find_row"
  | "delete_row"
  | "create_sheet";

type GoogleSheetsNodeData = {
  credentialId?: string;
  spreadsheetId?: string;
  sheetName?: string;
  operation?: GoogleSheetsOperation;
  range?: string;
  columnMappingJson?: string;
  limitRows?: number;
  useFirstRowAsHeaders?: boolean;
  matchColumn?: string;
  matchValue?: string;
};

type MappingValue = Record<string, unknown> | unknown[];

const DEFAULT_RANGE = "A:ZZ";

function resolveTemplate(
  template: string | undefined,
  context: Record<string, unknown>,
) {
  if (!template) {
    return "";
  }
  return decode(Handlebars.compile(template)(context)).trim();
}

function getStartRowFromRange(range: string): number {
  const rowMatch = range.match(/\D+(\d+)/);
  if (!rowMatch) {
    return 1;
  }
  return Number(rowMatch[1]) || 1;
}

function parseMappingJson(
  mappingJson: string | undefined,
  context: Record<string, unknown>,
): MappingValue | undefined {
  if (!mappingJson?.trim()) {
    return undefined;
  }

  const resolved = resolveTemplate(mappingJson, context);
  const parsed = JSON.parse(resolved) as unknown;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Column mapping must be a JSON object or array.");
  }

  if (Array.isArray(parsed)) {
    return parsed;
  }

  return parsed as Record<string, unknown>;
}

function convertRowToObject(headers: string[], row: string[]) {
  const result: Record<string, string> = {};
  headers.forEach((header, index) => {
    result[String(header)] = String(row[index] ?? "");
  });
  return result;
}

function getColumnIndex(
  matchColumn: string,
  headers: string[],
  useHeaders: boolean,
): number {
  if (useHeaders) {
    return headers.findIndex(
      (header) =>
        header.trim().toLowerCase() === matchColumn.trim().toLowerCase(),
    );
  }

  const alpha = matchColumn.trim().toUpperCase();
  if (/^[A-Z]+$/.test(alpha)) {
    let index = 0;
    for (let i = 0; i < alpha.length; i += 1) {
      index = index * 26 + (alpha.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  const numeric = Number(matchColumn);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric - 1;
  }

  return -1;
}

export const googleSheetsExecutor: NodeExecutor<GoogleSheetsNodeData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(
    googleSheetsChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  const fail = async (message: string) => {
    await publish(
      googleSheetsChannel().status({
        nodeId,
        status: "error",
      }),
    );

    return {
      ...context,
      googleSheets: {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      },
    };
  };

  if (!data.credentialId) {
    return fail("Google Sheets credential is required.");
  }

  const credential = await step.run(
    "get-google-sheets-credential",
    async () => {
      return prisma.credential.findUnique({
        where: {
          id: data.credentialId,
          userId,
          type: CredentialType.GOOGLE_SHEETS,
        },
      });
    },
  );

  if (!credential) {
    return fail("Google Sheets credential not found.");
  }

  const operation = data.operation ?? "read_rows";
  const spreadsheetId = resolveTemplate(data.spreadsheetId, context);
  const sheetName = resolveTemplate(data.sheetName, context);
  const range = resolveTemplate(data.range, context) || DEFAULT_RANGE;
  const useHeaders = data.useFirstRowAsHeaders ?? true;
  const limitRows =
    data.limitRows && data.limitRows > 0 ? data.limitRows : undefined;
  const matchColumn = resolveTemplate(data.matchColumn, context);
  const matchValue = resolveTemplate(data.matchValue, context);

  if (!spreadsheetId) {
    return fail("Spreadsheet is required.");
  }

  if (operation !== "create_sheet" && !sheetName) {
    return fail("Sheet is required.");
  }

  const a1Range = `${sheetName}!${range}`;

  try {
    const result = await step.run("execute-google-sheets", async () => {
      const { sheets } = await createGoogleSheetsClients(credential.value);

      if (operation === "create_sheet") {
        if (!sheetName) {
          throw new Error("Sheet title is required to create sheet.");
        }

        const response = await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: sheetName,
                  },
                },
              },
            ],
          },
        });

        const created = response.data.replies?.[0]?.addSheet?.properties;
        return {
          success: true,
          created: {
            sheetId: created?.sheetId,
            title: created?.title || sheetName,
          },
          timestamp: new Date().toISOString(),
        };
      }

      if (operation === "read_rows") {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: a1Range,
        });
        const values = response.data.values ?? [];

        if (!useHeaders) {
          const rows = limitRows ? values.slice(0, limitRows) : values;
          return {
            success: true,
            rows,
            timestamp: new Date().toISOString(),
          };
        }

        const [headerRow, ...dataRows] = values;
        const headers = (headerRow ?? []).map((header) => String(header));
        const limitedRows = limitRows ? dataRows.slice(0, limitRows) : dataRows;

        const rows = limitedRows.map((row) =>
          convertRowToObject(
            headers,
            row.map((cell) => String(cell)),
          ),
        );

        return {
          success: true,
          rows,
          timestamp: new Date().toISOString(),
        };
      }

      if (operation === "append_row") {
        const mapping = parseMappingJson(data.columnMappingJson, context);
        if (!mapping) {
          throw new Error("Column mapping is required for Append Row.");
        }

        let rowValues: string[] = [];
        if (Array.isArray(mapping)) {
          rowValues = mapping.map((item) => String(item ?? ""));
        } else if (useHeaders) {
          const headerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!1:1`,
          });
          const headers = (headerResponse.data.values?.[0] ?? []).map(
            (header) => String(header),
          );
          rowValues = headers.map((header) => String(mapping[header] ?? ""));
        } else {
          rowValues = Object.values(mapping).map((value) =>
            String(value ?? ""),
          );
        }

        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetName}!A:ZZ`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [rowValues],
          },
        });

        return {
          success: true,
          appended: 1,
          timestamp: new Date().toISOString(),
        };
      }

      const readResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: a1Range,
      });
      const values = (readResponse.data.values ?? []).map((row) =>
        row.map((cell) => String(cell)),
      );

      const startRow = getStartRowFromRange(range);
      const headers = useHeaders ? (values[0] ?? []).map(String) : [];
      const dataRows = useHeaders ? values.slice(1) : values;
      const firstDataRowNumber = useHeaders ? startRow + 1 : startRow;

      if (!matchColumn || !matchValue) {
        throw new Error(
          "Match column and value are required for this operation.",
        );
      }

      const matchColumnIndex = getColumnIndex(matchColumn, headers, useHeaders);
      if (matchColumnIndex < 0) {
        throw new Error("Match column not found.");
      }

      const matchingRows = dataRows
        .map((row, index) => ({
          row,
          rowNumber: firstDataRowNumber + index,
          matchedValue: String(row[matchColumnIndex] ?? ""),
        }))
        .filter((entry) => entry.matchedValue === matchValue);

      if (matchingRows.length === 0) {
        if (operation === "find_row") {
          return {
            success: true,
            rows: [],
            timestamp: new Date().toISOString(),
          };
        }
        return {
          success: true,
          updated: 0,
          deleted: 0,
          timestamp: new Date().toISOString(),
        };
      }

      if (operation === "find_row") {
        const rows = matchingRows
          .slice(0, limitRows ?? matchingRows.length)
          .map((entry) =>
            useHeaders
              ? convertRowToObject(headers, entry.row)
              : entry.row.map((cell) => String(cell)),
          );

        return {
          success: true,
          rows,
          timestamp: new Date().toISOString(),
        };
      }

      if (operation === "update_row") {
        const mapping = parseMappingJson(data.columnMappingJson, context);
        if (!mapping || Array.isArray(mapping)) {
          throw new Error("Update Row requires JSON object column mapping.");
        }

        const rowsToUpdate = matchingRows.slice(0, limitRows ?? 1);
        for (const rowItem of rowsToUpdate) {
          const nextRow = [...rowItem.row];

          if (useHeaders) {
            Object.entries(mapping).forEach(([columnName, value]) => {
              const index = headers.findIndex(
                (header) =>
                  header.trim().toLowerCase() ===
                  columnName.trim().toLowerCase(),
              );
              if (index >= 0) {
                nextRow[index] = String(value ?? "");
              }
            });
          } else {
            Object.entries(mapping).forEach(([columnKey, value]) => {
              const index = getColumnIndex(columnKey, [], false);
              if (index >= 0) {
                nextRow[index] = String(value ?? "");
              }
            });
          }

          const maxColumn = Math.max(
            nextRow.length,
            headers.length || nextRow.length,
          );
          const rowRange = `${sheetName}!A${rowItem.rowNumber}:${toColumnLetter(
            maxColumn,
          )}${rowItem.rowNumber}`;

          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: rowRange,
            valueInputOption: "USER_ENTERED",
            requestBody: {
              values: [nextRow],
            },
          });
        }

        return {
          success: true,
          updated: rowsToUpdate.length,
          timestamp: new Date().toISOString(),
        };
      }

      if (operation === "delete_row") {
        const rowsToDelete = matchingRows.slice(0, limitRows ?? 1);
        const sheetResponse = await sheets.spreadsheets.get({
          spreadsheetId,
          fields: "sheets(properties(sheetId,title))",
        });
        const sheet = sheetResponse.data.sheets?.find(
          (item) => item.properties?.title === sheetName,
        );
        const sheetId = sheet?.properties?.sheetId;

        if (!Number.isFinite(sheetId)) {
          throw new Error("Sheet not found.");
        }

        const requests = rowsToDelete
          .map((row) => ({
            deleteDimension: {
              range: {
                sheetId: sheetId as number,
                dimension: "ROWS" as const,
                startIndex: row.rowNumber - 1,
                endIndex: row.rowNumber,
              },
            },
          }))
          .sort(
            (a, b) =>
              b.deleteDimension.range.startIndex -
              a.deleteDimension.range.startIndex,
          );

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests,
          },
        });

        return {
          success: true,
          deleted: rowsToDelete.length,
          timestamp: new Date().toISOString(),
        };
      }

      throw new Error(`Unsupported Google Sheets operation: ${operation}`);
    });

    await publish(
      googleSheetsChannel().status({
        nodeId,
        status: "success",
      }),
    );

    return {
      ...context,
      googleSheets: result,
    };
  } catch (error) {
    return fail(mapGoogleSheetsError(error));
  }
};
