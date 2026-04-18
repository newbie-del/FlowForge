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
                  !isSmtpType ? (
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
