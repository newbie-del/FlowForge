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
  errorPath: z.string().min(1, "Error path is required"),
  retryCount: z.number().int().min(0),
  retryDelaySeconds: z.number().int().min(0),
  fallbackMessage: z.string().optional(),
  continueWorkflow: z.boolean(),
});

export type ErrorHandlerFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ErrorHandlerFormValues) => void;
  defaultValues?: Partial<ErrorHandlerFormValues>;
}

export function ErrorHandlerDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) {
  const form = useForm<ErrorHandlerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variableName: defaultValues.variableName ?? "errorHandler",
      errorPath: defaultValues.errorPath ?? "__lastError",
      retryCount: defaultValues.retryCount ?? 1,
      retryDelaySeconds: defaultValues.retryDelaySeconds ?? 30,
      fallbackMessage: defaultValues.fallbackMessage ?? "Step failed.",
      continueWorkflow: defaultValues.continueWorkflow ?? true,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      variableName: defaultValues.variableName ?? "errorHandler",
      errorPath: defaultValues.errorPath ?? "__lastError",
      retryCount: defaultValues.retryCount ?? 1,
      retryDelaySeconds: defaultValues.retryDelaySeconds ?? 30,
      fallbackMessage: defaultValues.fallbackMessage ?? "Step failed.",
      continueWorkflow: defaultValues.continueWorkflow ?? true,
    });
  }, [defaultValues, form, open]);

  const handleSubmit = (values: ErrorHandlerFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] min-h-0 w-[min(96vw,38rem)] flex-col overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle>Error Handler</DialogTitle>
          <DialogDescription>
            Configure retries, fallback messaging, and continuation behavior.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <Form {...form}>
            <form
              id="error-handler-form"
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
                      <Input {...field} placeholder="errorHandler" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="errorPath"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Error Path</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="__lastError or {{myError}}"
                      />
                    </FormControl>
                    <FormDescription>
                      Path in context where error payload exists.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="retryCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Retry Count</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={1}
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
                <FormField
                  control={form.control}
                  name="retryDelaySeconds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Retry Delay (seconds)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={1}
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
                name="fallbackMessage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fallback Message</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        className="min-h-[90px]"
                        placeholder="Primary step failed. Alert sent to Telegram."
                      />
                    </FormControl>
                    <FormDescription>
                      Used when propagating failure details.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="continueWorkflow"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FormLabel>Continue workflow</FormLabel>
                      <FormDescription>
                        If disabled, this node stops execution after handling.
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
          <Button type="submit" form="error-handler-form">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
