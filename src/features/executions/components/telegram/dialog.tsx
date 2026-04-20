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
import { sendTelegramNodeTest } from "./actions";

const fileSourceSchema = z.enum(["url", "upload", "previous_node"]);

const formSchema = z
  .object({
    variableName: z
      .string()
      .min(1, { message: "Variable name is required" })
      .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
        message:
          "Variable name must start with a letter or underscore and contain only letters, numbers, and underscores",
      }),
    credentialId: z.string().min(1, { message: "Credential is required" }),
    chatId: z.string().min(1, { message: "Chat ID is required" }),
    operation: z.enum(["send_message", "send_photo", "send_document"], {
      message: "Please select an operation",
    }),
    message: z.string().optional(),
    photoUrl: z.string().optional(),
    documentUrl: z.string().optional(),
    photoSource: fileSourceSchema,
    documentSource: fileSourceSchema,
    photoFileName: z.string().optional(),
    photoMimeType: z.string().optional(),
    photoBase64: z.string().optional(),
    photoBinaryTemplate: z.string().optional(),
    documentFileName: z.string().optional(),
    documentMimeType: z.string().optional(),
    documentBase64: z.string().optional(),
    documentBinaryTemplate: z.string().optional(),
    parseMode: z.enum(["plain", "markdown", "html"]),
    disableNotification: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.operation === "send_message" && !values.message?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["message"],
        message: "Message is required for send message operation.",
      });
    }

    if (values.operation === "send_photo") {
      if (values.photoSource === "url" && !values.photoUrl?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["photoUrl"],
          message: "Photo URL is required when source is URL.",
        });
      }

      if (values.photoSource === "upload" && !values.photoBase64?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["photoBase64"],
          message: "Please upload a photo file.",
        });
      }

      if (
        values.photoSource === "previous_node" &&
        !values.photoBinaryTemplate?.trim()
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["photoBinaryTemplate"],
          message: "Provide template for previous node file output.",
        });
      }
    }

    if (values.operation === "send_document") {
      if (values.documentSource === "url" && !values.documentUrl?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["documentUrl"],
          message: "Document URL is required when source is URL.",
        });
      }

      if (
        values.documentSource === "upload" &&
        !values.documentBase64?.trim()
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["documentBase64"],
          message: "Please upload a document file.",
        });
      }

      if (
        values.documentSource === "previous_node" &&
        !values.documentBinaryTemplate?.trim()
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["documentBinaryTemplate"],
          message: "Provide template for previous node file output.",
        });
      }
    }
  });

export type TelegramFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: TelegramFormValues) => void;
  defaultValues?: Partial<TelegramFormValues>;
  credentials: Array<{ id: string; name: string }>;
}

async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file."));
        return;
      }
      const base64 = result.includes(",")
        ? (result.split(",")[1] ?? "")
        : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

export const TelegramDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
  credentials,
}: Props) => {
  const [operation, setOperation] = useState<
    "send_message" | "send_photo" | "send_document"
  >(defaultValues.operation || "send_message");
  const [isSendingTest, startSendTest] = useTransition();

  const form = useForm<TelegramFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variableName: defaultValues.variableName || "",
      credentialId: defaultValues.credentialId || "",
      chatId: defaultValues.chatId || "",
      operation: defaultValues.operation || "send_message",
      message: defaultValues.message || "",
      photoUrl: defaultValues.photoUrl || "",
      documentUrl: defaultValues.documentUrl || "",
      photoSource: defaultValues.photoSource || "url",
      documentSource: defaultValues.documentSource || "url",
      photoFileName: defaultValues.photoFileName || "",
      photoMimeType: defaultValues.photoMimeType || "",
      photoBase64: defaultValues.photoBase64 || "",
      photoBinaryTemplate: defaultValues.photoBinaryTemplate || "",
      documentFileName: defaultValues.documentFileName || "",
      documentMimeType: defaultValues.documentMimeType || "",
      documentBase64: defaultValues.documentBase64 || "",
      documentBinaryTemplate: defaultValues.documentBinaryTemplate || "",
      parseMode: defaultValues.parseMode || "plain",
      disableNotification: defaultValues.disableNotification || false,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        variableName: defaultValues.variableName || "",
        credentialId: defaultValues.credentialId || "",
        chatId: defaultValues.chatId || "",
        operation: defaultValues.operation || "send_message",
        message: defaultValues.message || "",
        photoUrl: defaultValues.photoUrl || "",
        documentUrl: defaultValues.documentUrl || "",
        photoSource: defaultValues.photoSource || "url",
        documentSource: defaultValues.documentSource || "url",
        photoFileName: defaultValues.photoFileName || "",
        photoMimeType: defaultValues.photoMimeType || "",
        photoBase64: defaultValues.photoBase64 || "",
        photoBinaryTemplate: defaultValues.photoBinaryTemplate || "",
        documentFileName: defaultValues.documentFileName || "",
        documentMimeType: defaultValues.documentMimeType || "",
        documentBase64: defaultValues.documentBase64 || "",
        documentBinaryTemplate: defaultValues.documentBinaryTemplate || "",
        parseMode: defaultValues.parseMode || "plain",
        disableNotification: defaultValues.disableNotification || false,
      });
      setOperation(defaultValues.operation || "send_message");
    }
  }, [open, defaultValues, form]);

  const watchVariableName = form.watch("variableName") || "telegram";
  const isPhotoOperation = operation === "send_photo";
  const isDocumentOperation = operation === "send_document";
  const photoSource = form.watch("photoSource");
  const documentSource = form.watch("documentSource");
  const usePreviousNodeFile =
    isPhotoOperation && photoSource === "previous_node"
      ? true
      : isDocumentOperation && documentSource === "previous_node";

  const handleSubmit = (values: TelegramFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  const handleOperationChange = (
    value: "send_message" | "send_photo" | "send_document",
  ) => {
    setOperation(value);
    form.setValue("operation", value);
  };

  const handleFileUpload = async (file: File, kind: "photo" | "document") => {
    const base64 = await fileToBase64(file);

    if (kind === "photo") {
      form.setValue("photoFileName", file.name);
      form.setValue("photoMimeType", file.type || "application/octet-stream");
      form.setValue("photoBase64", base64);
      form.setValue("photoSource", "upload");
      return;
    }

    form.setValue("documentFileName", file.name);
    form.setValue("documentMimeType", file.type || "application/octet-stream");
    form.setValue("documentBase64", base64);
    form.setValue("documentSource", "upload");
  };

  const runSendTest = async () => {
    const values = form.getValues();
    const response = await sendTelegramNodeTest({
      credentialId: values.credentialId,
      chatId: values.chatId,
      message: values.message?.trim() || "Flowforge Telegram test message",
      parseMode: values.parseMode,
      disableNotification: values.disableNotification,
    });

    if (response.success) {
      toast.success(response.message);
      return;
    }
    toast.error(response.message);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col overflow-hidden min-h-0">
        <DialogHeader className="shrink-0">
          <DialogTitle>Telegram Configuration</DialogTitle>
          <DialogDescription>
            Configure Telegram bot credentials, operation, and file input mode.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-6 mt-4 px-6 pb-6"
            >
              <FormField
                control={form.control}
                name="variableName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Variable Name</FormLabel>
                    <FormControl>
                      <Input placeholder="telegramAlert" {...field} />
                    </FormControl>
                    <FormDescription>
                      Use this name to reference the result in other nodes:{" "}
                      {`{{${watchVariableName}.success}}`}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="credentialId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bot Token Credential</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Telegram credential" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {credentials.map((cred) => (
                          <SelectItem key={cred.id} value={cred.id}>
                            {cred.name}
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
                name="chatId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chat ID</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="-1001234567890 or @channel_name"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Numeric ID or @channel username. Use templates like{" "}
                      {`{{telegramTarget}}`}.
                    </FormDescription>
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
                    <Select
                      onValueChange={(value) =>
                        handleOperationChange(
                          value as
                            | "send_message"
                            | "send_photo"
                            | "send_document",
                        )
                      }
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="send_message">
                          Send Message
                        </SelectItem>
                        <SelectItem value="send_photo">Send Photo</SelectItem>
                        <SelectItem value="send_document">
                          Send Document
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {(isPhotoOperation || isDocumentOperation) && (
                <FormItem className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <FormLabel>Use previous node file output</FormLabel>
                      <FormDescription>
                        Enable to send binary data from previous node context.
                      </FormDescription>
                    </div>
                    <Switch
                      checked={Boolean(usePreviousNodeFile)}
                      onCheckedChange={(checked) => {
                        if (isPhotoOperation) {
                          form.setValue(
                            "photoSource",
                            checked ? "previous_node" : "url",
                          );
                          return;
                        }
                        form.setValue(
                          "documentSource",
                          checked ? "previous_node" : "url",
                        );
                      }}
                    />
                  </div>
                </FormItem>
              )}

              {isPhotoOperation && photoSource !== "previous_node" && (
                <FormField
                  control={form.control}
                  name="photoSource"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Photo Source</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="url">Photo URL</SelectItem>
                          <SelectItem value="upload">Upload File</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isDocumentOperation && documentSource !== "previous_node" && (
                <FormField
                  control={form.control}
                  name="documentSource"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document Source</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="url">Document URL</SelectItem>
                          <SelectItem value="upload">Upload File</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isPhotoOperation && photoSource === "url" && (
                <FormField
                  control={form.control}
                  name="photoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Photo URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://example.com/photo.jpg"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isDocumentOperation && documentSource === "url" && (
                <FormField
                  control={form.control}
                  name="documentUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://example.com/report.pdf"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isPhotoOperation && photoSource === "upload" && (
                <FormItem>
                  <FormLabel>Upload Photo</FormLabel>
                  <FormControl>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        try {
                          await handleFileUpload(file, "photo");
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Failed to process uploaded photo.",
                          );
                        }
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Choose or drag-drop an image file into this input.
                  </FormDescription>
                  {form.watch("photoFileName") && (
                    <p className="text-xs text-muted-foreground">
                      Selected: {form.watch("photoFileName")}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}

              {isDocumentOperation && documentSource === "upload" && (
                <FormItem>
                  <FormLabel>Upload Document</FormLabel>
                  <FormControl>
                    <Input
                      type="file"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        try {
                          await handleFileUpload(file, "document");
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Failed to process uploaded document.",
                          );
                        }
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Choose or drag-drop a file into this input.
                  </FormDescription>
                  {form.watch("documentFileName") && (
                    <p className="text-xs text-muted-foreground">
                      Selected: {form.watch("documentFileName")}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}

              {isPhotoOperation && photoSource === "previous_node" && (
                <FormField
                  control={form.control}
                  name="photoBinaryTemplate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Previous Node Photo Binary</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='{{json screenshot.binary}} or {"url":"{{imageUrl}}"}'
                          className="min-h-[80px] font-mono text-sm"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Supports URL, base64, or JSON with file metadata from
                        prior nodes.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isDocumentOperation && documentSource === "previous_node" && (
                <FormField
                  control={form.control}
                  name="documentBinaryTemplate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Previous Node Document Binary</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='{{json report.binary}} or {"url":"{{pdfUrl}}"}'
                          className="min-h-[80px] font-mono text-sm"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Supports URL, base64, or JSON with file metadata from
                        prior nodes.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {operation === "send_message"
                        ? "Message"
                        : "Caption (Optional)"}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={
                          operation === "send_message"
                            ? "New job alert: {{job.title}} at {{job.company}}"
                            : "Attachment caption..."
                        }
                        className="min-h-[100px] font-mono text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Supports template variables like {`{{variable.path}}`}.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="parseMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parse Mode</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="plain">Plain Text</SelectItem>
                        <SelectItem value="markdown">Markdown</SelectItem>
                        <SelectItem value="html">HTML</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="disableNotification"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Disable Notification</FormLabel>
                      <FormDescription>
                        Send message silently without push notification.
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

              <DialogFooter className="mt-4 pb-0 shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSendingTest}
                  onClick={() => startSendTest(runSendTest)}
                >
                  Test Message
                </Button>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
