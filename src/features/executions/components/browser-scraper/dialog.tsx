"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
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

const selectorSchema = z.object({
  key: z.string().min(1, "Key is required"),
  selector: z.string().min(1, "Selector is required"),
  extract: z.enum(["text", "html", "attr"]),
  attr: z.string().optional(),
  multiple: z.boolean().optional(),
});

const formSchema = z.object({
  variableName: z
    .string()
    .min(1, "Variable name is required")
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
      message:
        "Variable name must start with a letter or underscore and contain only alphanumeric characters.",
    }),
  url: z.string().min(1, "URL is required"),
  method: z.enum(["GET", "POST"]),
  mode: z.enum(["simple_fetch", "html_scrape", "extract_data"]),
  requestBody: z.string().optional(),
  headersJson: z.string().optional(),
  userAgent: z.enum(["default", "chrome", "firefox", "custom"]),
  customUserAgent: z.string().optional(),
  timeoutMs: z.number().int().min(1000).max(120000),
  followRedirects: z.boolean(),
  selectors: z.array(selectorSchema).default([]),
});

export type BrowserScraperFormValues = z.infer<typeof formSchema>;
type BrowserScraperFormInputValues = z.input<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: BrowserScraperFormValues) => void;
  defaultValues?: Partial<BrowserScraperFormValues>;
}

export function BrowserScraperDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) {
  const [preview, setPreview] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const form = useForm<
    BrowserScraperFormInputValues,
    unknown,
    BrowserScraperFormValues
  >({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variableName: defaultValues.variableName ?? "scraperResult",
      url: defaultValues.url ?? "",
      method: defaultValues.method ?? "GET",
      mode: defaultValues.mode ?? "html_scrape",
      requestBody: defaultValues.requestBody ?? "",
      headersJson: defaultValues.headersJson ?? "{}",
      userAgent: defaultValues.userAgent ?? "default",
      customUserAgent: defaultValues.customUserAgent ?? "",
      timeoutMs: defaultValues.timeoutMs ?? 15000,
      followRedirects: defaultValues.followRedirects ?? true,
      selectors: defaultValues.selectors ?? [],
    },
  });

  const mode = form.watch("mode");
  const method = form.watch("method");
  const userAgent = form.watch("userAgent");
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "selectors",
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      variableName: defaultValues.variableName ?? "scraperResult",
      url: defaultValues.url ?? "",
      method: defaultValues.method ?? "GET",
      mode: defaultValues.mode ?? "html_scrape",
      requestBody: defaultValues.requestBody ?? "",
      headersJson: defaultValues.headersJson ?? "{}",
      userAgent: defaultValues.userAgent ?? "default",
      customUserAgent: defaultValues.customUserAgent ?? "",
      timeoutMs: defaultValues.timeoutMs ?? 15000,
      followRedirects: defaultValues.followRedirects ?? true,
      selectors: defaultValues.selectors ?? [],
    });
    setPreview("");
  }, [defaultValues, form, open]);

  const handlePreview = async () => {
    const values = form.getValues();
    if (!values.url.trim()) {
      toast.error("Enter URL to preview.");
      return;
    }

    setPreviewLoading(true);
    try {
      const response = await fetch(values.url, { method: values.method });
      const html = await response.text();
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch?.[1]?.trim() ?? "";
      const links = Array.from(html.matchAll(/href=["']([^"']+)["']/gi))
        .slice(0, 20)
        .map((match) => match[1]);
      setPreview(
        JSON.stringify(
          {
            status: response.status,
            title,
            htmlLength: html.length,
            linkCount: links.length,
            links,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      setPreview("");
      toast.error(
        error instanceof Error ? error.message : "Preview request failed.",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSubmit = (values: BrowserScraperFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] min-h-0 w-[min(96vw,48rem)] flex-col overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle>Browser / Scraper</DialogTitle>
          <DialogDescription>
            Fetch HTML pages and extract text, links, and selected fields.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <Form {...form}>
            <form
              id="browser-scraper-form"
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-5 px-6 py-5"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="variableName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Variable Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="scraperResult" />
                      </FormControl>
                      <FormDescription>
                        Use result as {"{{scraperResult}}"} in next nodes.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Method</FormLabel>
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
                          <SelectItem value="GET">GET</SelectItem>
                          <SelectItem value="POST">POST</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="https://jobs.example.com"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {method === "POST" ? (
                <FormField
                  control={form.control}
                  name="requestBody"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Request Body (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          className="min-h-[90px] font-mono text-xs"
                          placeholder='{"query":"react jobs"}'
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="mode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mode</FormLabel>
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
                          <SelectItem value="simple_fetch">
                            Simple Fetch
                          </SelectItem>
                          <SelectItem value="html_scrape">
                            HTML Scrape
                          </SelectItem>
                          <SelectItem value="extract_data">
                            Extract Data
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="timeoutMs"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timeout (ms)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1000}
                          max={120000}
                          step={500}
                          value={field.value}
                          onChange={(event) =>
                            field.onChange(Number(event.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="headersJson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Headers JSON</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        className="min-h-[90px] font-mono text-xs"
                        placeholder='{"Accept":"text/html"}'
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="userAgent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>User-Agent</FormLabel>
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
                          <SelectItem value="default">Default Bot</SelectItem>
                          <SelectItem value="chrome">Chrome</SelectItem>
                          <SelectItem value="firefox">Firefox</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {userAgent === "custom" ? (
                  <FormField
                    control={form.control}
                    name="customUserAgent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custom User-Agent</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Mozilla/5.0 ..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
              </div>

              <FormField
                control={form.control}
                name="followRedirects"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FormLabel>Follow redirects</FormLabel>
                      <FormDescription>
                        Disable only when you need redirect response details.
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

              {mode === "extract_data" ? (
                <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Selectors</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        append({
                          key: "",
                          selector: "",
                          extract: "text",
                          attr: "",
                          multiple: false,
                        })
                      }
                    >
                      <PlusIcon className="size-4" />
                      Add selector
                    </Button>
                  </div>
                  {fields.map((item, index) => (
                    <div
                      key={item.id}
                      className="space-y-2 rounded-md border p-3"
                    >
                      <div className="grid gap-2 md:grid-cols-2">
                        <FormField
                          control={form.control}
                          name={`selectors.${index}.key`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Key</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="jobTitle" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`selectors.${index}.selector`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>CSS Selector</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder=".job-card h2" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid gap-2 md:grid-cols-3">
                        <FormField
                          control={form.control}
                          name={`selectors.${index}.extract`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Extract</FormLabel>
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
                                  <SelectItem value="html">HTML</SelectItem>
                                  <SelectItem value="attr">
                                    Attribute
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`selectors.${index}.attr`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Attribute</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="href" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`selectors.${index}.multiple`}
                          render={({ field }) => (
                            <FormItem className="flex h-full items-center justify-between rounded-md border p-2">
                              <FormLabel>Multiple</FormLabel>
                              <FormControl>
                                <Switch
                                  checked={Boolean(field.value)}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                      >
                        <Trash2Icon className="size-4" />
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Preview</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={previewLoading}
                    onClick={handlePreview}
                  >
                    <SearchIcon className="size-4" />
                    {previewLoading ? "Fetching..." : "Preview result"}
                  </Button>
                </div>
                {preview ? (
                  <pre className="max-h-48 overflow-auto rounded border bg-background p-2 text-xs [scrollbar-width:thin]">
                    {preview}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Run preview to inspect page title, links, and response
                    details.
                  </p>
                )}
              </div>
            </form>
          </Form>
        </div>
        <DialogFooter className="sticky bottom-0 z-10 shrink-0 border-t bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button type="submit" form="browser-scraper-form">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
