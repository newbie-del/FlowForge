"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useTransition } from "react";
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
import { sendEmailNodeTest, testEmailConnection } from "./actions";

type SmtpProvider = "gmail" | "outlook" | "custom";

const formSchema = z
  .object({
    fromEmail: z.string().min(1, "From Email is required"),
    toEmail: z.string().min(1, "To Email is required"),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    subject: z.string().min(1, "Subject is required"),
    messageBody: z.string().min(1, "Message Body is required"),
    htmlMode: z.boolean(),
    attachmentsJson: z.string().optional(),
    provider: z.enum(["gmail", "outlook", "custom"]),
    credentialId: z.string().min(1, "Credential is required"),
    customHost: z.string().optional(),
    customPort: z.coerce.number().int().positive().optional(),
    customSecure: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.provider === "custom") {
      if (!values.customHost?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["customHost"],
          message: "Custom SMTP host is required.",
        });
      }
      if (!values.customPort) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["customPort"],
          message: "Custom SMTP port is required.",
        });
      }
    }
  });

export type EmailFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: EmailFormValues) => void;
  defaultValues?: Partial<EmailFormValues>;
}

export const EmailDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) => {
  const [isTestingConnection, startConnectionTest] = useTransition();
  const [isSendingTest, startSendTest] = useTransition();
  const { data: credentials, isLoading: isLoadingCredentials } =
    useCredentialsByType(CredentialType.SMTP);

  const form = useForm<EmailFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fromEmail: defaultValues.fromEmail || "",
      toEmail: defaultValues.toEmail || "",
      cc: defaultValues.cc || "",
      bcc: defaultValues.bcc || "",
      subject: defaultValues.subject || "",
      messageBody: defaultValues.messageBody || "",
      htmlMode: defaultValues.htmlMode ?? false,
      attachmentsJson: defaultValues.attachmentsJson || "",
      provider: defaultValues.provider || "gmail",
      credentialId: defaultValues.credentialId || "",
      customHost: defaultValues.customHost || "",
      customPort: defaultValues.customPort,
      customSecure: defaultValues.customSecure ?? false,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        fromEmail: defaultValues.fromEmail || "",
        toEmail: defaultValues.toEmail || "",
        cc: defaultValues.cc || "",
        bcc: defaultValues.bcc || "",
        subject: defaultValues.subject || "",
        messageBody: defaultValues.messageBody || "",
        htmlMode: defaultValues.htmlMode ?? false,
        attachmentsJson: defaultValues.attachmentsJson || "",
        provider: defaultValues.provider || "gmail",
        credentialId: defaultValues.credentialId || "",
        customHost: defaultValues.customHost || "",
        customPort: defaultValues.customPort,
        customSecure: defaultValues.customSecure ?? false,
      });
    }
  }, [defaultValues, form, open]);

  const provider = form.watch("provider");
  const htmlMode = form.watch("htmlMode");

  const runConnectionTest = async () => {
    const values = form.getValues();
    if (!values.credentialId) {
      toast.error("Choose a credential first.");
      return;
    }

    const response = await testEmailConnection({
      provider: values.provider,
      credentialId: values.credentialId,
      customHost: values.customHost,
      customPort: values.customPort,
      customSecure: values.customSecure,
    });

    if (response.success) {
      toast.success(response.message);
      return;
    }
    toast.error(response.message);
  };

  const runSendTest = async () => {
    const values = form.getValues();
    if (!values.credentialId) {
      toast.error("Choose a credential first.");
      return;
    }

    const response = await sendEmailNodeTest({
      provider: values.provider,
      credentialId: values.credentialId,
      fromEmail: values.fromEmail,
      toEmail: values.toEmail,
      subject: values.subject,
      messageBody: values.messageBody,
      htmlMode: values.htmlMode,
      customHost: values.customHost,
      customPort: values.customPort,
      customSecure: values.customSecure,
    });

    if (response.success) {
      toast.success(response.message);
      return;
    }
    toast.error(response.message);
  };

  const handleSubmit = (values: EmailFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email Configuration</DialogTitle>
          <DialogDescription>
            Configure SMTP provider, credential, and email content.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6 mt-4"
          >
            <FormField
              control={form.control}
              name="provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SMTP Provider</FormLabel>
                  <Select
                    onValueChange={(value: SmtpProvider) =>
                      field.onChange(value)
                    }
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="gmail">Gmail</SelectItem>
                      <SelectItem value="outlook">Outlook</SelectItem>
                      <SelectItem value="custom">Custom SMTP</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                        <SelectValue placeholder="Select SMTP credential" />
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

            {provider === "custom" && (
              <>
                <FormField
                  control={form.control}
                  name="customHost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom SMTP Host</FormLabel>
                      <FormControl>
                        <Input placeholder="smtp.your-domain.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="customPort"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom SMTP Port</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="587"
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="customSecure"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <FormLabel>Use Secure SMTP (SSL/TLS)</FormLabel>
                        <FormDescription>
                          Turn on for SMTPS endpoints (usually port 465).
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
              </>
            )}

            <FormField
              control={form.control}
              name="fromEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>From Email</FormLabel>
                  <FormControl>
                    <Input placeholder="sender@company.com" {...field} />
                  </FormControl>
                  <FormDescription>
                    Supports templates like {"{{senderEmail}}"}.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="toEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>To Email</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="user@company.com, {{email}}"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Comma-separated recipients.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cc"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CC</FormLabel>
                  <FormControl>
                    <Input placeholder="ops@company.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bcc"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>BCC</FormLabel>
                  <FormControl>
                    <Input placeholder="audit@company.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input placeholder="Job Update for {{name}}" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="messageBody"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message Body</FormLabel>
                  <FormControl>
                    <Textarea
                      className="min-h-[120px] font-mono text-sm"
                      placeholder="Hello {{name}}"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {htmlMode
                      ? "HTML content enabled."
                      : "Plain-text content mode."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="htmlMode"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <FormLabel>HTML Mode</FormLabel>
                    <FormDescription>
                      Send Message Body as HTML.
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
              name="attachmentsJson"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Attachments (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      className="min-h-[80px] font-mono text-sm"
                      placeholder='[{"filename":"report.txt","content":"Hello"}]'
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    JSON array compatible with Nodemailer attachments.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isTestingConnection}
                onClick={() => startConnectionTest(runConnectionTest)}
              >
                Test Connection
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isSendingTest}
                onClick={() => startSendTest(runSendTest)}
              >
                Send Test Email
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
