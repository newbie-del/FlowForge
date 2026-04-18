"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { CredentialType } from "@/generated/prisma";
import { useUpgradeModal } from "@/hooks/use-upgrade-modal";
import {
  useCreateCredential,
  useSuspenseCredential,
  useUpdateCredential,
} from "../hooks/use-credentials";

const formSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    type: z.enum(CredentialType),
    value: z.string().optional(),
    emailAddress: z.string().optional(),
    smtpUsername: z.string().optional(),
    smtpPassword: z.string().optional(),
    host: z.string().optional(),
    port: z.coerce.number().int().positive().optional(),
    secure: z.boolean(),
    googleAuthType: z.enum(["service_account", "oauth"]).optional(),
    serviceAccountJson: z.string().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    refreshToken: z.string().optional(),
    redirectUri: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.type === CredentialType.SMTP) {
      if (!values.emailAddress?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["emailAddress"],
          message: "Email address is required",
        });
      }
      if (!values.smtpUsername?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["smtpUsername"],
          message: "SMTP username is required",
        });
      }
      if (!values.smtpPassword?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["smtpPassword"],
          message: "SMTP password is required",
        });
      }
      return;
    }

    if (values.type === CredentialType.GOOGLE_SHEETS) {
      const authType = values.googleAuthType;
      if (!authType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["googleAuthType"],
          message: "Google auth type is required",
        });
        return;
      }

      if (authType === "service_account") {
        if (!values.serviceAccountJson?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["serviceAccountJson"],
            message: "Service account JSON is required",
          });
        }
        return;
      }

      if (!values.clientId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["clientId"],
          message: "Client ID is required",
        });
      }
      if (!values.clientSecret?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["clientSecret"],
          message: "Client secret is required",
        });
      }
      if (!values.refreshToken?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["refreshToken"],
          message: "Refresh token is required",
        });
      }
      return;
    }

    if (!values.value?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Value is required",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

const credentialTypeOptions = [
  {
    value: CredentialType.OPENAI,
    label: "OpenAI",
    logo: "/logos/openai.svg",
  },
  {
    value: CredentialType.ANTHROPIC,
    label: "Anthropic",
    logo: "/logos/anthropic.svg",
  },
  {
    value: CredentialType.GEMINI,
    label: "Gemini",
    logo: "/logos/gemini.svg",
  },
  {
    value: CredentialType.SMTP,
    label: "SMTP",
    logo: "",
  },
  {
    value: CredentialType.GOOGLE_SHEETS,
    label: "Google Sheets",
    logo: "/logos/googlesheets.svg",
  },
];

interface CredentialFormProps {
  initialData?: {
    id?: string;
    name: string;
    type: CredentialType;
    value: string;
  };
}

type SmtpCredentialValue = {
  emailAddress: string;
  smtpUsername: string;
  smtpPassword: string;
  host?: string;
  port?: number;
  secure?: boolean;
};

type GoogleSheetsCredentialValue = {
  authType: "service_account" | "oauth";
  serviceAccountJson?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  redirectUri?: string;
};

const parseSmtpCredentialValue = (
  rawValue: string,
): Partial<SmtpCredentialValue> => {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<SmtpCredentialValue>;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
};

const parseGoogleSheetsCredentialValue = (
  rawValue: string,
): Partial<GoogleSheetsCredentialValue> => {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<GoogleSheetsCredentialValue>;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
};

export const CredentialForm = ({ initialData }: CredentialFormProps) => {
  const router = useRouter();
  const createCredential = useCreateCredential();
  const updateCredential = useUpdateCredential();
  const { handleError, modal } = useUpgradeModal();

  const isEdit = !!initialData?.id;
  const smtpDefaults =
    initialData?.type === CredentialType.SMTP
      ? parseSmtpCredentialValue(initialData.value)
      : {};
  const googleSheetsDefaults =
    initialData?.type === CredentialType.GOOGLE_SHEETS
      ? parseGoogleSheetsCredentialValue(initialData.value)
      : {};

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || "",
      type: initialData?.type || CredentialType.OPENAI,
      value:
        initialData?.type === CredentialType.SMTP
          ? ""
          : initialData?.value || "",
      emailAddress: smtpDefaults.emailAddress || "",
      smtpUsername: smtpDefaults.smtpUsername || "",
      smtpPassword: smtpDefaults.smtpPassword || "",
      host: smtpDefaults.host || "",
      port: smtpDefaults.port,
      secure: smtpDefaults.secure ?? false,
      googleAuthType: googleSheetsDefaults.authType || "service_account",
      serviceAccountJson: googleSheetsDefaults.serviceAccountJson || "",
      clientId: googleSheetsDefaults.clientId || "",
      clientSecret: googleSheetsDefaults.clientSecret || "",
      refreshToken: googleSheetsDefaults.refreshToken || "",
      redirectUri: googleSheetsDefaults.redirectUri || "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    const payload = {
      name: values.name,
      type: values.type,
      value:
        values.type === CredentialType.SMTP
          ? JSON.stringify({
              emailAddress: values.emailAddress?.trim(),
              smtpUsername: values.smtpUsername?.trim(),
              smtpPassword: values.smtpPassword,
              host: values.host?.trim() || undefined,
              port: values.port,
              secure: values.secure,
            })
          : values.type === CredentialType.GOOGLE_SHEETS
            ? JSON.stringify({
                authType: values.googleAuthType,
                serviceAccountJson:
                  values.serviceAccountJson?.trim() || undefined,
                clientId: values.clientId?.trim() || undefined,
                clientSecret: values.clientSecret?.trim() || undefined,
                refreshToken: values.refreshToken?.trim() || undefined,
                redirectUri: values.redirectUri?.trim() || undefined,
              })
            : values.value?.trim() || "",
    };

    if (isEdit && initialData?.id) {
      await updateCredential.mutateAsync({
        id: initialData.id,
        ...payload,
      });
    } else {
      await createCredential.mutateAsync(payload, {
        onSuccess: (data) => {
          router.push(`/credentials/${data.id}`);
        },
        onError: (error) => {
          handleError(error);
        },
      });
    }
  };
  const selectedType = form.watch("type");
  const isSmtpType = selectedType === CredentialType.SMTP;
  const isGoogleSheetsType = selectedType === CredentialType.GOOGLE_SHEETS;
  const googleAuthType = form.watch("googleAuthType");

  return (
    <>
      {modal}
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>{isEdit ? "Edit Credential" : "New Credential"}</CardTitle>
          <CardDescription>
            {isEdit
              ? "Update your API key or credential details."
              : "Create a new API key or credential to your account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My API key" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {credentialTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-x-2">
                              {option.value === CredentialType.SMTP ? (
                                <MailIcon className="size-4" />
                              ) : (
                                <Image
                                  src={option.logo}
                                  alt={option.label}
                                  width={16}
                                  height={16}
                                />
                              )}
                              {option.label}
                            </div>
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
                name="value"
                render={({ field }) =>
                  !isSmtpType && !isGoogleSheetsType ? (
                    <FormItem>
                      <FormLabel>API Key</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="sk-..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  ) : null
                }
              />
              {isSmtpType && (
                <>
                  <div className="rounded-md border bg-muted/30 p-4 text-sm">
                    <p className="font-medium">Quick setup: SMTP (Email)</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                      <li>
                        For Gmail, use{" "}
                        <span className="font-mono text-xs">
                          smtp.gmail.com
                        </span>{" "}
                        and port <span className="font-mono text-xs">587</span>.
                      </li>
                      <li>
                        Turn on 2-Step Verification in your Google account.
                      </li>
                      <li>
                        Create a Gmail App Password and paste it as SMTP
                        Password.
                      </li>
                      <li>
                        Use your full email as SMTP Username and Email Address.
                      </li>
                    </ol>
                    <a
                      className="mt-3 inline-block text-xs text-primary underline underline-offset-2"
                      href="https://support.google.com/accounts/answer/185833"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Gmail App Password guide
                    </a>
                  </div>
                  <FormField
                    control={form.control}
                    name="emailAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input placeholder="sender@company.com" {...field} />
                        </FormControl>
                        <FormDescription>
                          Default sender mailbox for this SMTP account.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="smtpUsername"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SMTP Username</FormLabel>
                        <FormControl>
                          <Input placeholder="sender@company.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="smtpPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SMTP Password / App Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="••••••••••••••••"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="host"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default Host (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="smtp.gmail.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="port"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default Port (Optional)</FormLabel>
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
                    name="secure"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-md border p-3">
                        <div>
                          <FormLabel>Secure SMTP</FormLabel>
                          <FormDescription>
                            Enable for SSL/TLS connections (usually port 465).
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
              {isGoogleSheetsType ? (
                <>
                  <FormField
                    control={form.control}
                    name="googleAuthType"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Auth Type</FormLabel>
                        <FormControl>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <button
                              type="button"
                              className={`rounded-md border p-3 text-left transition-colors ${
                                field.value === "service_account"
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:border-primary/40"
                              }`}
                              onClick={() => field.onChange("service_account")}
                            >
                              <p className="text-sm font-medium">
                                Service Account
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Use JSON key and share sheet with service
                                account email.
                              </p>
                            </button>
                            <button
                              type="button"
                              className={`rounded-md border p-3 text-left transition-colors ${
                                field.value === "oauth"
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:border-primary/40"
                              }`}
                              onClick={() => field.onChange("oauth")}
                            >
                              <p className="text-sm font-medium">OAuth</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Use your Google account via client credentials +
                                refresh token.
                              </p>
                            </button>
                          </div>
                        </FormControl>
                        <FormDescription>
                          Choose one auth method. Each method has a separate
                          credential form below.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {googleAuthType === "service_account" ? (
                    <div className="rounded-md border bg-muted/30 p-4 text-sm">
                      <p className="font-medium">
                        Quick setup: Google Sheets Service Account
                      </p>
                      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                        <li>Create a service account in Google Cloud.</li>
                        <li>Create and download a JSON key.</li>
                        <li>Paste full JSON into the field below.</li>
                        <li>
                          Share your spreadsheet with the service account email
                          (
                          <span className="font-mono text-xs">
                            ...iam.gserviceaccount.com
                          </span>
                          ).
                        </li>
                      </ol>
                      <a
                        className="mt-3 inline-block text-xs text-primary underline underline-offset-2"
                        href="https://cloud.google.com/iam/docs/service-accounts-create"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Service Account setup guide
                      </a>
                    </div>
                  ) : (
                    <div className="rounded-md border bg-muted/30 p-4 text-sm">
                      <p className="font-medium">
                        Quick setup: Google Sheets OAuth
                      </p>
                      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                        <li>Enable Google Sheets API and Google Drive API.</li>
                        <li>Create OAuth Client ID + Client Secret.</li>
                        <li>
                          Add redirect URL{" "}
                          <span className="font-mono text-xs">
                            https://developers.google.com/oauthplayground
                          </span>
                          .
                        </li>
                        <li>
                          Use OAuth Playground to generate and copy refresh
                          token.
                        </li>
                      </ol>
                      <a
                        className="mt-3 inline-block text-xs text-primary underline underline-offset-2"
                        href="https://developers.google.com/oauthplayground"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open OAuth Playground
                      </a>
                    </div>
                  )}

                  {googleAuthType === "service_account" ? (
                    <FormField
                      control={form.control}
                      name="serviceAccountJson"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Service Account JSON</FormLabel>
                          <FormControl>
                            <Textarea
                              className="min-h-[180px] font-mono text-xs"
                              placeholder='{"type":"service_account","project_id":"..."}'
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Paste full service account JSON key from Google
                            Cloud.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <>
                      <FormField
                        control={form.control}
                        name="clientId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Client ID</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="xxxxxxxx.apps.googleusercontent.com"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="clientSecret"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Client Secret</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="GOCSPX-..."
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="refreshToken"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Refresh Token</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="1//0g..."
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="redirectUri"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Redirect URL (Optional)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="https://your-app.com/api/auth/google/callback"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              Must match the exact OAuth redirect URL configured
                              in Google Cloud.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </>
              ) : null}

              <div className="flex gap-4">
                <Button
                  type="submit"
                  disabled={
                    createCredential.isPending || updateCredential.isPending
                  }
                >
                  {isEdit ? "Update" : "Create"}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/credentials" prefetch>
                    Cancel
                  </Link>
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </>
  );
};

export const CredentialView = ({ credentialId }: { credentialId: string }) => {
  const { data: credential } = useSuspenseCredential(credentialId);

  return <CredentialForm initialData={credential} />;
};
