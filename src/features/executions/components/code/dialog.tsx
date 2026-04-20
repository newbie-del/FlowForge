"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ClipboardCopyIcon,
  PlayIcon,
  RotateCcwIcon,
  SparklesIcon,
  WandSparklesIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";

const templates = {
  filter_items: `return items.filter((job) =>
  String(job?.title ?? "").toLowerCase().includes("react")
);`,
  map_items: `return items.map((job) => ({
  title: job.title,
  company: job.company,
  location: job.location,
  source: "linkedin",
}));`,
  map_fields: `return items.map((job) => ({
  title: job.title,
  company: job.company,
  location: job.location,
}));`,
  score_jobs: `return items.map((job) => ({
  ...job,
  score:
    String(job?.title ?? "").includes("Senior") ||
    String(job?.title ?? "").includes("Lead")
      ? 95
      : 70,
}));`,
  rename_fields: `return {
  role: input.title,
  employer: input.company,
  city: input.location,
};`,
  transform_payload: `return {
  generatedAt: new Date().toISOString(),
  totalItems: items.length,
  items: items.map((item, index) => ({
    ...item,
    index,
  })),
};`,
} as const;

const templateValues = [
  "filter_items",
  "map_items",
  "map_fields",
  "score_jobs",
  "rename_fields",
  "transform_payload",
] as const;

const formSchema = z.object({
  variableName: z
    .string()
    .min(1, "Variable name is required")
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
      message:
        "Variable name must start with a letter or underscore and use alphanumeric characters.",
    }),
  timeoutMs: z.number().int().min(250).max(10000),
  template: z.enum(templateValues),
  code: z.string().min(1, "Code is required"),
});

export type CodeNodeFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CodeNodeFormValues) => void;
  defaultValues?: Partial<CodeNodeFormValues>;
}

function extractLineNumber(error: unknown) {
  if (!(error instanceof Error)) return null;
  const stack = error.stack ?? "";
  const lineMatch = stack.match(/<anonymous>:(\d+):(\d+)/);
  if (lineMatch?.[1]) {
    const line = Number(lineMatch[1]);
    if (Number.isFinite(line)) {
      return Math.max(1, line - 1);
    }
  }
  const messageMatch = error.message.match(/line\s+(\d+)/i);
  if (messageMatch?.[1]) {
    return Number(messageMatch[1]);
  }
  return null;
}

function formatJavaScript(code: string) {
  const lines = code.split("\n");
  let indent = 0;
  return lines
    .map((rawLine) => {
      const line = rawLine.trim();
      if (!line) return "";
      if (
        line.startsWith("}") ||
        line.startsWith("];") ||
        line.startsWith("),")
      ) {
        indent = Math.max(0, indent - 1);
      }
      const formatted = `${"  ".repeat(indent)}${line}`;
      if (line.endsWith("{") || line.endsWith("[") || line.endsWith("(")) {
        indent += 1;
      }
      return formatted;
    })
    .join("\n");
}

function renderHighlightedCode(rawCode: string) {
  const keywords = new Set([
    "return",
    "const",
    "let",
    "var",
    "if",
    "else",
    "for",
    "while",
    "await",
    "async",
    "try",
    "catch",
    "throw",
    "new",
  ]);

  const renderLine = (line: string, index: number) => {
    const parts: ReactNode[] = [];
    const tokenPattern = /(".*?"|'.*?'|`.*?`|\/\/.*|\b[A-Za-z_]\w*\b)/g;
    let lastIndex = 0;

    for (const match of line.matchAll(tokenPattern)) {
      const token = match[0];
      const tokenIndex = match.index ?? 0;
      if (tokenIndex > lastIndex) {
        parts.push(line.slice(lastIndex, tokenIndex));
      }

      if (token.startsWith("//")) {
        parts.push(
          <span
            key={`${index}-${tokenIndex}`}
            className="text-muted-foreground"
          >
            {token}
          </span>,
        );
      } else if (
        token.startsWith('"') ||
        token.startsWith("'") ||
        token.startsWith("`")
      ) {
        parts.push(
          <span key={`${index}-${tokenIndex}`} className="text-emerald-400">
            {token}
          </span>,
        );
      } else if (keywords.has(token)) {
        parts.push(
          <span key={`${index}-${tokenIndex}`} className="text-sky-400">
            {token}
          </span>,
        );
      } else {
        parts.push(token);
      }
      lastIndex = tokenIndex + token.length;
    }

    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    return (
      <div key={`line-${index}`} className="whitespace-pre">
        {parts.length > 0 ? parts : " "}
      </div>
    );
  };

  return rawCode.split("\n").map(renderLine);
}

export function CodeNodeDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) {
  const defaultTemplate = useMemo(
    () =>
      (defaultValues.template ??
        "filter_items") as CodeNodeFormValues["template"],
    [defaultValues.template],
  );

  const [testOutput, setTestOutput] = useState<string>("");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [testError, setTestError] = useState<string>("");
  const [errorLine, setErrorLine] = useState<number | null>(null);

  const form = useForm<CodeNodeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variableName: defaultValues.variableName ?? "codeResult",
      timeoutMs: defaultValues.timeoutMs ?? 3000,
      template: defaultTemplate,
      code: defaultValues.code ?? templates[defaultTemplate],
    },
  });

  useEffect(() => {
    if (!open) return;
    const nextTemplate = (defaultValues.template ??
      "filter_items") as CodeNodeFormValues["template"];
    form.reset({
      variableName: defaultValues.variableName ?? "codeResult",
      timeoutMs: defaultValues.timeoutMs ?? 3000,
      template: nextTemplate,
      code: defaultValues.code ?? templates[nextTemplate],
    });
    setTestOutput("");
    setConsoleLogs([]);
    setTestError("");
    setErrorLine(null);
  }, [defaultValues, form, open]);

  const selectedTemplate = form.watch("template");
  const codeValue = form.watch("code");

  const highlightedCode = useMemo(
    () => renderHighlightedCode(codeValue),
    [codeValue],
  );

  const handleTemplateChange = (value: CodeNodeFormValues["template"]) => {
    form.setValue("template", value);
    form.setValue("code", templates[value]);
  };

  const handleResetTemplate = () => {
    form.setValue("code", templates[selectedTemplate]);
  };

  const handleFormatCode = () => {
    const currentCode = form.getValues("code");
    form.setValue("code", formatJavaScript(currentCode), { shouldDirty: true });
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(form.getValues("code"));
      toast.success("Code copied.");
    } catch {
      toast.error("Could not copy code.");
    }
  };

  const handleRunTestCode = async () => {
    const values = form.getValues();
    const sampleItems = [
      { title: "React Developer", company: "ACME", location: "Remote" },
      { title: "Node Developer", company: "Globex", location: "Pune" },
    ];
    const sampleInput = sampleItems[0] as Record<string, unknown>;
    const logs: string[] = [];
    setTestError("");
    setErrorLine(null);

    try {
      // Client-side dry run for quick feedback only.
      const fn = new Function(
        "input",
        "items",
        "payload",
        "console",
        `"use strict";\n${values.code}`,
      );
      const scopedConsole = {
        log: (...args: unknown[]) => {
          logs.push(
            args
              .map((arg) =>
                typeof arg === "string" ? arg : JSON.stringify(arg, null, 2),
              )
              .join(" "),
          );
        },
      };
      const rawResult = fn(
        sampleInput,
        sampleItems,
        sampleInput,
        scopedConsole,
      );
      const result = await Promise.resolve(rawResult);
      setConsoleLogs(logs);
      setTestOutput(
        typeof result === "string" ? result : JSON.stringify(result, null, 2),
      );
      toast.success("Code test passed.");
    } catch (error) {
      setConsoleLogs(logs);
      setTestOutput("");
      setErrorLine(extractLineNumber(error));
      setTestError(
        error instanceof Error ? error.message : "Code test failed.",
      );
      toast.error("Code test failed.");
    }
  };

  const handleSubmit = (values: CodeNodeFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] min-h-0 w-[min(96vw,52rem)] flex-col overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle>Code</DialogTitle>
          <DialogDescription>
            Execute custom JavaScript with sandboxed runtime.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <Form {...form}>
            <form
              id="code-node-form"
              onSubmit={form.handleSubmit(handleSubmit)}
              className="mt-1 space-y-5 px-6 py-5"
            >
              <FormField
                control={form.control}
                name="variableName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Variable Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="codeResult" />
                    </FormControl>
                    <FormDescription>
                      Result is available in next nodes as {"{{variableName}}"}.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="template"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={handleTemplateChange}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="filter_items">
                            Filter items
                          </SelectItem>
                          <SelectItem value="map_items">Map items</SelectItem>
                          <SelectItem value="score_jobs">Score jobs</SelectItem>
                          <SelectItem value="rename_fields">
                            Rename fields
                          </SelectItem>
                          <SelectItem value="transform_payload">
                            Transform payload
                          </SelectItem>
                          <SelectItem value="map_fields">
                            Map fields (legacy)
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
                          min={250}
                          max={10000}
                          step={250}
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
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        className="min-h-[260px] resize-y font-mono text-sm"
                        placeholder={`return items.map((item) => ({ ...item, done: true }));`}
                      />
                    </FormControl>
                    <FormDescription>
                      Available variables: input, items, payload, console.log().
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRunTestCode}
                >
                  <PlayIcon className="size-4" />
                  Run test code
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResetTemplate}
                >
                  <RotateCcwIcon className="size-4" />
                  Reset template
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleFormatCode}
                >
                  <WandSparklesIcon className="size-4" />
                  Format code
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopyCode}
                >
                  <ClipboardCopyIcon className="size-4" />
                  Copy code
                </Button>
              </div>

              <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <SparklesIcon className="size-4" />
                  Syntax Preview
                </p>
                <pre className="max-h-44 overflow-auto rounded border bg-background p-3 text-xs [scrollbar-width:thin]">
                  {highlightedCode}
                </pre>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                  <p className="text-sm font-medium">Output Preview</p>
                  {testOutput ? (
                    <pre className="max-h-40 overflow-auto rounded border bg-background p-2 text-xs [scrollbar-width:thin]">
                      {testOutput}
                    </pre>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Run test code to preview result.
                    </p>
                  )}
                </div>

                <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                  <p className="text-sm font-medium">Console Logs</p>
                  {consoleLogs.length > 0 ? (
                    <pre className="max-h-40 overflow-auto rounded border bg-background p-2 text-xs [scrollbar-width:thin]">
                      {consoleLogs.join("\n")}
                    </pre>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No logs captured.
                    </p>
                  )}
                </div>
              </div>

              {testError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  <p className="font-medium">Test Error</p>
                  <p>{testError}</p>
                  {errorLine ? <p>Line: {errorLine}</p> : null}
                </div>
              ) : null}
            </form>
          </Form>
        </div>
        <DialogFooter className="sticky bottom-0 z-10 shrink-0 border-t bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button type="submit" form="code-node-form">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
