"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
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

const setFieldTypes = ["text", "number", "boolean", "json", "array"] as const;

const formSchema = z
  .object({
    fields: z
      .array(
        z.object({
          name: z.string().min(1, "Field name is required"),
          value: z.string().default(""),
          type: z.enum(setFieldTypes),
        }),
      )
      .min(1, "Add at least one field"),
    keepOnlySetFields: z.boolean(),
    includePreviousData: z.boolean(),
    useExpressions: z.boolean(),
  })
  .superRefine((values, ctx) => {
    const seen = new Set<string>();
    values.fields.forEach((field, index) => {
      const normalized = field.name.trim().toLowerCase();
      if (seen.has(normalized)) {
        ctx.addIssue({
          code: "custom",
          path: ["fields", index, "name"],
          message: "Duplicate field name",
        });
      }
      seen.add(normalized);
      if (
        (field.type === "json" || field.type === "array") &&
        field.value.trim()
      ) {
        try {
          const parsed = JSON.parse(field.value);
          if (field.type === "array" && !Array.isArray(parsed)) {
            ctx.addIssue({
              code: "custom",
              path: ["fields", index, "value"],
              message: "Array type requires valid JSON array.",
            });
          }
        } catch {
          ctx.addIssue({
            code: "custom",
            path: ["fields", index, "value"],
            message: "Invalid JSON value.",
          });
        }
      }
    });
  });

export type SetNodeFormValues = z.infer<typeof formSchema>;
type SetNodeFormInputValues = z.input<typeof formSchema>;
type SetFieldType = (typeof setFieldTypes)[number];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: SetNodeFormValues) => void;
  defaultValues?: Partial<SetNodeFormValues>;
}

function getDefaultFields(values?: Partial<SetNodeFormValues>) {
  if (values?.fields?.length) {
    return values.fields;
  }
  return [{ name: "", value: "", type: "text" as const }];
}

function parsePathToken(value: string) {
  const tokens: string[] = [];
  const pattern = /([^.[\]]+)|\[(\d+)\]/g;
  for (const match of value.matchAll(pattern)) {
    if (match[1]) tokens.push(match[1]);
    else if (match[2]) tokens.push(match[2]);
  }
  return tokens;
}

function getValueByPath(source: unknown, rawPath: string): unknown {
  if (!rawPath) return undefined;
  const tokens = parsePathToken(rawPath.trim());
  let current: unknown = source;
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(token);
      current = Number.isNaN(index) ? undefined : current[index];
      continue;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[token];
      continue;
    }
    return undefined;
  }
  return current;
}

function setValueByPath(
  target: Record<string, unknown>,
  rawPath: string,
  value: unknown,
) {
  const tokens = parsePathToken(rawPath);
  if (tokens.length === 0) {
    return;
  }

  let current: Record<string, unknown> = target;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i];
    if (!token) continue;
    const existing = current[token];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      current[token] = {};
    }
    current = current[token] as Record<string, unknown>;
  }

  const finalKey = tokens[tokens.length - 1];
  if (!finalKey) return;
  current[finalKey] = value;
}

function resolveValueExpression(
  value: string,
  useExpressions: boolean,
  context: Record<string, unknown>,
) {
  if (!useExpressions) return value;

  const fullPattern = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  const fullMatch = value.match(fullPattern);
  if (fullMatch?.[1]) {
    return getValueByPath(context, fullMatch[1]);
  }

  return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, path: string) => {
    const resolved = getValueByPath(context, path);
    return resolved === undefined || resolved === null ? "" : String(resolved);
  });
}

function coercePreviewValue(type: SetFieldType, value: unknown) {
  if (type === "text") {
    return String(value ?? "");
  }
  if (type === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error("invalid number");
    }
    return parsed;
  }
  if (type === "boolean") {
    if (typeof value === "boolean") return value;
    const normalized = String(value ?? "")
      .trim()
      .toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n", ""].includes(normalized)) return false;
    throw new Error("invalid boolean");
  }
  if (type === "json" || type === "array") {
    const parsed =
      typeof value === "string" ? JSON.parse(value) : JSON.parse(String(value));
    if (type === "array" && !Array.isArray(parsed)) {
      throw new Error("array expected");
    }
    return parsed;
  }
  return value;
}

function buildPreviewOutput(values: {
  fields: Array<{ name: string; value: string; type: SetFieldType }>;
  keepOnlySetFields: boolean;
  includePreviousData: boolean;
  useExpressions: boolean;
}) {
  const sampleInput = { name: "Rahul", email: "rahul@gmail.com" };
  const output =
    values.keepOnlySetFields || !values.includePreviousData
      ? ({} as Record<string, unknown>)
      : ({ ...sampleInput } as Record<string, unknown>);

  for (const field of values.fields) {
    const name = field.name.trim();
    if (!name) continue;

    const resolved = resolveValueExpression(
      field.value,
      values.useExpressions,
      sampleInput,
    );
    const coerced = coercePreviewValue(field.type, resolved);
    setValueByPath(output, name, coerced);
  }

  return { sampleInput, output };
}

export function SetNodeDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) {
  const form = useForm<SetNodeFormInputValues, unknown, SetNodeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fields: getDefaultFields(defaultValues),
      keepOnlySetFields: Boolean(defaultValues.keepOnlySetFields),
      includePreviousData: defaultValues.includePreviousData ?? true,
      useExpressions: defaultValues.useExpressions ?? true,
    },
  });

  const { fields, append, remove, insert, move } = useFieldArray({
    control: form.control,
    name: "fields",
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      fields: getDefaultFields(defaultValues),
      keepOnlySetFields: Boolean(defaultValues.keepOnlySetFields),
      includePreviousData: defaultValues.includePreviousData ?? true,
      useExpressions: defaultValues.useExpressions ?? true,
    });
  }, [defaultValues, form, open]);

  const keepOnly = form.watch("keepOnlySetFields");
  const watchedFields = form.watch("fields");
  const includePreviousData = form.watch("includePreviousData");
  const useExpressions = form.watch("useExpressions");

  const preview = useMemo(() => {
    try {
      return buildPreviewOutput({
        fields:
          watchedFields?.map((field) => ({
            name: String(field.name ?? ""),
            value: String(field.value ?? ""),
            type:
              field.type === "number" ||
              field.type === "boolean" ||
              field.type === "json" ||
              field.type === "array"
                ? field.type
                : "text",
          })) ?? [],
        keepOnlySetFields: keepOnly,
        includePreviousData,
        useExpressions,
      });
    } catch {
      return null;
    }
  }, [watchedFields, keepOnly, includePreviousData, useExpressions]);

  const handleSubmit = (values: SetNodeFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] min-h-0 w-[min(96vw,44rem)] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle>Set</DialogTitle>
          <DialogDescription>
            Add or modify payload fields with optional expressions.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <Form {...form}>
            <form
              id="set-node-form"
              onSubmit={form.handleSubmit(handleSubmit)}
              className="mt-1 space-y-6 px-6 py-5"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <FormLabel>Fields</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      append({ name: "", value: "", type: "text" })
                    }
                  >
                    <PlusIcon className="size-4" />
                    Add field
                  </Button>
                </div>
                {fields.map((fieldItem, index) => (
                  <div
                    key={fieldItem.id}
                    className="space-y-3 rounded-md border bg-muted/20 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">
                        Field {index + 1}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() =>
                            insert(index + 1, {
                              name:
                                form.getValues(`fields.${index}.name`) ?? "",
                              value:
                                form.getValues(`fields.${index}.value`) ?? "",
                              type:
                                form.getValues(`fields.${index}.type`) ??
                                "text",
                            })
                          }
                        >
                          <CopyIcon className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          disabled={index === 0}
                          onClick={() => move(index, index - 1)}
                        >
                          <ArrowUpIcon className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          disabled={index === fields.length - 1}
                          onClick={() => move(index, index + 1)}
                        >
                          <ArrowDownIcon className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                          disabled={fields.length === 1}
                          onClick={() => remove(index)}
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <FormField
                      control={form.control}
                      name={`fields.${index}.name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Field Name</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="status or user.name"
                            />
                          </FormControl>
                          <FormDescription>
                            Nested paths are supported (example: user.name,
                            jobs[0].title).
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`fields.${index}.type`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="number">Number</SelectItem>
                              <SelectItem value="boolean">Boolean</SelectItem>
                              <SelectItem value="json">JSON</SelectItem>
                              <SelectItem value="array">Array</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`fields.${index}.value`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Value</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              className="min-h-[104px] resize-y font-mono text-sm"
                              placeholder="approved or Hello {{name}} or { &quot;a&quot;: 1 }"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ))}
              </div>

              <FormField
                control={form.control}
                name="keepOnlySetFields"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FormLabel>Keep only set fields</FormLabel>
                      <FormDescription>
                        Remove existing fields and output only configured
                        fields.
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

              <FormField
                control={form.control}
                name="includePreviousData"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FormLabel>Include previous data</FormLabel>
                      <FormDescription>
                        Keep original payload while adding/updating fields.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={keepOnly}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="useExpressions"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FormLabel>Use expressions</FormLabel>
                      <FormDescription>
                        Resolve templates like {"{{name}}"} and nested values.
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
              <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                <p className="text-sm font-medium">Output Preview</p>
                <p className="text-xs text-muted-foreground">
                  Based on sample input and current settings.
                </p>
                {preview ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Input
                      </p>
                      <pre className="max-h-40 overflow-auto rounded border bg-background p-2 text-xs [scrollbar-width:thin]">
                        {JSON.stringify(preview.sampleInput, null, 2)}
                      </pre>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Output
                      </p>
                      <pre className="max-h-40 overflow-auto rounded border bg-background p-2 text-xs [scrollbar-width:thin]">
                        {JSON.stringify(preview.output, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-destructive">
                    Preview unavailable: fix invalid values to render output.
                  </p>
                )}
              </div>
            </form>
          </Form>
        </div>
        <DialogFooter className="sticky bottom-0 z-10 shrink-0 border-t bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button type="submit" form="set-node-form">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
