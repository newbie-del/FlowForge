"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCredentialsByType } from "@/features/credentials/hooks/use-credentials";
import { CredentialType } from "@/generated/prisma";
import {
  listGoogleSheetsSpreadsheets,
  listGoogleSheetsTabsAction,
  previewGoogleSheetsData,
  testGoogleSheetsNodeConnection,
} from "./actions";

const operationValues = [
  "read_rows",
  "append_row",
  "update_row",
  "find_row",
  "delete_row",
  "create_sheet",
] as const;

const formSchema = z
  .object({
    credentialId: z.string().min(1, "Credential is required"),
    spreadsheetId: z.string().min(1, "Spreadsheet is required"),
    sheetName: z.string().min(1, "Sheet is required"),
    operation: z.enum(operationValues),
    range: z.string().optional(),
    columnMappingJson: z.string().optional(),
    limitRows: z.coerce.number().int().positive().optional(),
    useFirstRowAsHeaders: z.boolean(),
    matchColumn: z.string().optional(),
    matchValue: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (["append_row", "update_row"].includes(values.operation)) {
      if (!values.columnMappingJson?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["columnMappingJson"],
          message: "Column mapping is required for this operation.",
        });
      }
    }

    if (["update_row", "find_row", "delete_row"].includes(values.operation)) {
      if (!values.matchColumn?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["matchColumn"],
          message: "Match column is required.",
        });
      }
      if (!values.matchValue?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["matchValue"],
          message: "Match value is required.",
        });
      }
    }
  });

export type GoogleSheetsFormValues = z.infer<typeof formSchema>;

type SpreadsheetOption = {
  id: string;
  name: string;
};

type SheetOption = {
  sheetId: number;
  title: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: GoogleSheetsFormValues) => void;
  defaultValues?: Partial<GoogleSheetsFormValues>;
}

export const GoogleSheetsDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) => {
  const [isTesting, startTesting] = useTransition();
  const [isPreviewing, startPreview] = useTransition();
  const [isLoadingSpreadsheets, startLoadSpreadsheets] = useTransition();
  const [isLoadingSheets, startLoadSheets] = useTransition();
  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetOption[]>([]);
  const [sheets, setSheets] = useState<SheetOption[]>([]);
  const [preview, setPreview] = useState<unknown>(null);

  const { data: credentials, isLoading: isLoadingCredentials } =
    useCredentialsByType(CredentialType.GOOGLE_SHEETS);

  const form = useForm<GoogleSheetsFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      credentialId: defaultValues.credentialId || "",
      spreadsheetId: defaultValues.spreadsheetId || "",
      sheetName: defaultValues.sheetName || "",
      operation: defaultValues.operation || "read_rows",
      range: defaultValues.range || "A:ZZ",
      columnMappingJson: defaultValues.columnMappingJson || "",
      limitRows: defaultValues.limitRows,
      useFirstRowAsHeaders: defaultValues.useFirstRowAsHeaders ?? true,
      matchColumn: defaultValues.matchColumn || "",
      matchValue: defaultValues.matchValue || "",
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset({
      credentialId: defaultValues.credentialId || "",
      spreadsheetId: defaultValues.spreadsheetId || "",
      sheetName: defaultValues.sheetName || "",
      operation: defaultValues.operation || "read_rows",
      range: defaultValues.range || "A:ZZ",
      columnMappingJson: defaultValues.columnMappingJson || "",
      limitRows: defaultValues.limitRows,
      useFirstRowAsHeaders: defaultValues.useFirstRowAsHeaders ?? true,
      matchColumn: defaultValues.matchColumn || "",
      matchValue: defaultValues.matchValue || "",
    });
    setPreview(null);
  }, [defaultValues, form, open]);

  const credentialId = form.watch("credentialId");
  const spreadsheetId = form.watch("spreadsheetId");
  const operation = form.watch("operation");

  useEffect(() => {
    if (!open || !credentialId) {
      setSpreadsheets([]);
      return;
    }

    startLoadSpreadsheets(async () => {
      const result = await listGoogleSheetsSpreadsheets({ credentialId });
      if (!result.success) {
        toast.error(result.message);
        setSpreadsheets([]);
        return;
      }
      setSpreadsheets(result.spreadsheets);
    });
  }, [credentialId, open]);

  useEffect(() => {
    if (!open || !credentialId || !spreadsheetId) {
      setSheets([]);
      return;
    }

    startLoadSheets(async () => {
      const result = await listGoogleSheetsTabsAction({
        credentialId,
        spreadsheetId,
      });
      if (!result.success) {
        toast.error(result.message);
        setSheets([]);
        return;
      }
      setSheets(result.sheets);
    });
  }, [credentialId, spreadsheetId, open]);

  const runTestConnection = async () => {
    const values = form.getValues();
    const result = await testGoogleSheetsNodeConnection({
      credentialId: values.credentialId,
      spreadsheetId: values.spreadsheetId || undefined,
    });

    if (result.success) {
      toast.success(result.message);
      return;
    }

    toast.error(result.message);
  };

  const runPreviewData = async () => {
    const values = form.getValues();
    const result = await previewGoogleSheetsData({
      credentialId: values.credentialId,
      spreadsheetId: values.spreadsheetId,
      sheetName: values.sheetName,
      range: values.range,
      useFirstRowAsHeaders: values.useFirstRowAsHeaders,
      limitRows: values.limitRows,
    });

    if (!result.success) {
      toast.error(result.message);
      return;
    }

    setPreview(result.rows);
    toast.success("Preview loaded.");
  };

  const handleSubmit = (values: GoogleSheetsFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  const showMapping = ["append_row", "update_row"].includes(operation);
  const showMatch = ["update_row", "find_row", "delete_row"].includes(
    operation,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Google Sheets Configuration</DialogTitle>
          <DialogDescription>
            Configure Google Sheets operations and mapping for this node.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6 mt-4"
          >
            <FormField
              control={form.control}
              name="credentialId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Credential</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={isLoadingCredentials || !credentials?.length}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Google Sheets credential" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {credentials?.map((credential) => (
                        <SelectItem key={credential.id} value={credential.id}>
                          {credential.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="spreadsheetId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Spreadsheet</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!credentialId || isLoadingSpreadsheets}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select spreadsheet" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {spreadsheets.map((spreadsheet) => (
                        <SelectItem key={spreadsheet.id} value={spreadsheet.id}>
                          {spreadsheet.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Or paste a spreadsheet ID manually below.
                  </FormDescription>
                  <FormControl>
                    <Input
                      placeholder="1AbCDeFGhIjkLmNoPqRsTuVwXyZ"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sheetName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sheet</FormLabel>
                  {operation !== "create_sheet" ? (
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!spreadsheetId || isLoadingSheets}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select sheet" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sheets.map((sheet) => (
                          <SelectItem key={sheet.sheetId} value={sheet.title}>
                            {sheet.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <FormControl>
                    <Input
                      placeholder={
                        operation === "create_sheet"
                          ? "New sheet title"
                          : "Sheet1"
                      }
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="operation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Operation</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="read_rows">Read Rows</SelectItem>
                      <SelectItem value="append_row">Append Row</SelectItem>
                      <SelectItem value="update_row">Update Row</SelectItem>
                      <SelectItem value="find_row">Find Row</SelectItem>
                      <SelectItem value="delete_row">Delete Row</SelectItem>
                      <SelectItem value="create_sheet">Create Sheet</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="range"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Range (A1 notation)</FormLabel>
                  <FormControl>
                    <Input placeholder="A:ZZ" {...field} />
                  </FormControl>
                  <FormDescription>
                    Example: A:E, A2:F200, or A:ZZ for all columns.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {showMapping ? (
              <FormField
                control={form.control}
                name="columnMappingJson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Column Mapping (JSON)</FormLabel>
                    <FormControl>
                      <Textarea
                        className="min-h-[120px] font-mono text-sm"
                        placeholder='{"Date":"{{date}}","Company":"{{company}}","Role":"{{role}}","URL":"{{url}}","Status":"Applied"}'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Map columns to values with template variables.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {showMatch ? (
              <>
                <FormField
                  control={form.control}
                  name="matchColumn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Match Column</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={
                            form.getValues("useFirstRowAsHeaders")
                              ? "Status"
                              : "A or 1"
                          }
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="matchValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Match Value</FormLabel>
                      <FormControl>
                        <Input placeholder="Applied" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            ) : null}

            <FormField
              control={form.control}
              name="limitRows"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Limit Rows</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="10"
                      value={field.value ?? ""}
                      onChange={(event) =>
                        field.onChange(
                          event.target.value
                            ? Number(event.target.value)
                            : undefined,
                        )
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    Used for read/find limits and update/delete batch size.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="useFirstRowAsHeaders"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <FormLabel>Use First Row as Headers</FormLabel>
                    <FormDescription>
                      Return row objects using header names.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {preview ? (
              <div className="rounded-md border p-3">
                <p className="text-sm font-medium mb-2">Preview</p>
                <pre className="text-xs overflow-auto max-h-56">
                  {JSON.stringify(preview, null, 2)}
                </pre>
              </div>
            ) : null}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isTesting}
                onClick={() => startTesting(runTestConnection)}
              >
                Test Connection
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isPreviewing}
                onClick={() => startPreview(runPreviewData)}
              >
                Preview Data
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
