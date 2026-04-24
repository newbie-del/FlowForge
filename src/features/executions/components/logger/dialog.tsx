"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
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

const formSchema = z.object({
  variableName: z
    .string()
    .min(1, "Variable name is required")
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
      message:
        "Variable name must start with a letter or underscore and contain only alphanumeric characters.",
    }),
  level: z.enum(["info", "warning", "error", "debug"]),
  message: z.string().optional(),
  includeInputPayload: z.boolean(),
  includeTimestamp: z.boolean(),
});

export type LoggerFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: LoggerFormValues) => void;
  defaultValues?: Partial<LoggerFormValues>;
}

export function LoggerDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) {
  const form = useForm<LoggerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variableName: defaultValues.variableName ?? "logEntry",
      level: defaultValues.level ?? "info",
      message: defaultValues.message ?? "",
      includeInputPayload: defaultValues.includeInputPayload ?? false,
      includeTimestamp: defaultValues.includeTimestamp ?? true,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      variableName: defaultValues.variableName ?? "logEntry",
      level: defaultValues.level ?? "info",
      message: defaultValues.message ?? "",
      includeInputPayload: defaultValues.includeInputPayload ?? false,
      includeTimestamp: defaultValues.includeTimestamp ?? true,
    });
  }, [defaultValues, form, open]);

  const handleSubmit = (values: LoggerFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] min-h-0 w-[min(96vw,36rem)] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle>Logger</DialogTitle>
          <DialogDescription>
            Track workflow activity and create structured logs.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <Form {...form}>
            <form
              id="logger-form"
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-5 px-6 py-5"
            >
              <FormField
                control={form.control}
                name="variableName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Variable Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="logEntry" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Log Level</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="info">info</SelectItem>
                        <SelectItem value="warning">warning</SelectItem>
                        <SelectItem value="error">error</SelectItem>
                        <SelectItem value="debug">debug</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Log Message</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        className="min-h-[90px]"
                        placeholder="Job applied successfully for {{item.title}}"
                      />
                    </FormControl>
                    <FormDescription>
                      Supports template variables from workflow context.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="includeInputPayload"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FormLabel>Include input payload</FormLabel>
                      <FormDescription>
                        Attach incoming context to the log entry.
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
                name="includeTimestamp"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FormLabel>Include timestamp</FormLabel>
                      <FormDescription>
                        Add ISO timestamp to log metadata.
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
            </form>
          </Form>
        </div>
        <DialogFooter className="sticky bottom-0 z-10 shrink-0 border-t bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button type="submit" form="logger-form">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
