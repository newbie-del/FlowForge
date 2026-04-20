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

const loopModes = ["sequential", "parallel", "batch"] as const;

const formSchema = z
  .object({
    mode: z.enum(loopModes),
    itemsPath: z.string().min(1, "Items path is required"),
    batchSize: z.number().int().positive().optional(),
    maxItems: z.number().int().positive().optional(),
    delayBetweenItemsMs: z.number().int().min(0).default(0),
    continueOnItemError: z.boolean(),
    itemVariableName: z.string().min(1, "Item variable is required"),
    outputVariableName: z.string().min(1, "Output variable is required"),
  })
  .superRefine((values, ctx) => {
    if (
      values.mode === "batch" &&
      (!values.batchSize || values.batchSize <= 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["batchSize"],
        message: "Batch size must be greater than zero in batch mode.",
      });
    }
  });

export type LoopOverItemsFormValues = z.infer<typeof formSchema>;
type LoopOverItemsFormInputValues = z.input<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: LoopOverItemsFormValues) => void;
  defaultValues?: Partial<LoopOverItemsFormValues>;
}

export function LoopOverItemsDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) {
  const form = useForm<
    LoopOverItemsFormInputValues,
    unknown,
    LoopOverItemsFormValues
  >({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mode: defaultValues.mode ?? "sequential",
      itemsPath: defaultValues.itemsPath ?? "",
      batchSize: defaultValues.batchSize ?? 10,
      maxItems: defaultValues.maxItems,
      delayBetweenItemsMs: defaultValues.delayBetweenItemsMs ?? 0,
      continueOnItemError: defaultValues.continueOnItemError ?? false,
      itemVariableName: defaultValues.itemVariableName ?? "item",
      outputVariableName: defaultValues.outputVariableName ?? "loop",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      mode: defaultValues.mode ?? "sequential",
      itemsPath: defaultValues.itemsPath ?? "",
      batchSize: defaultValues.batchSize ?? 10,
      maxItems: defaultValues.maxItems,
      delayBetweenItemsMs: defaultValues.delayBetweenItemsMs ?? 0,
      continueOnItemError: defaultValues.continueOnItemError ?? false,
      itemVariableName: defaultValues.itemVariableName ?? "item",
      outputVariableName: defaultValues.outputVariableName ?? "loop",
    });
  }, [defaultValues, form, open]);

  const mode = form.watch("mode");

  const handleSubmit = (values: LoopOverItemsFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] min-h-0 w-[min(96vw,44rem)] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle>Loop Over Items</DialogTitle>
          <DialogDescription>
            Configure how array items should be processed.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <Form {...form}>
            <form
              id="loop-over-items-form"
              onSubmit={form.handleSubmit(handleSubmit)}
              className="mt-1 space-y-5 px-6 py-5"
            >
              <FormField
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mode</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="sequential">Sequential</SelectItem>
                        <SelectItem value="parallel">Parallel</SelectItem>
                        <SelectItem value="batch">Batch</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Sequential runs one-by-one, Parallel runs concurrently,
                      Batch processes groups.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="itemsPath"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Items Path</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="jobs or {{jobs}} or response.data.jobs"
                      />
                    </FormControl>
                    <FormDescription>
                      Must resolve to an array from previous node output.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {mode === "batch" && (
                <FormField
                  control={form.control}
                  name="batchSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Batch Size</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={field.value ?? ""}
                          onChange={(event) =>
                            field.onChange(Number(event.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="maxItems"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Items Limit (optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={field.value ?? ""}
                        placeholder="Leave empty for no limit"
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
                      Process only the first N items for safer runs on large
                      arrays.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="delayBetweenItemsMs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delay Between Items (ms)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={100}
                        value={field.value ?? 0}
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
                name="itemVariableName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Variable Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="item" />
                    </FormControl>
                    <FormDescription>
                      Current item is exposed as {"{{itemVariableName}}"}.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="outputVariableName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Output Variable Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="loop" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="continueOnItemError"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FormLabel>Continue on item error</FormLabel>
                      <FormDescription>
                        Continue processing remaining items when one item fails.
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
              <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  Items Path Examples
                </p>
                <p>jobs</p>
                <p>{"{{jobs}}"}</p>
                <p>response.data.jobs</p>
              </div>
            </form>
          </Form>
        </div>
        <DialogFooter className="sticky bottom-0 z-10 shrink-0 border-t bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button type="submit" form="loop-over-items-form">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
