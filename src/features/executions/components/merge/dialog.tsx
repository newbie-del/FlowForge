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

const mergeModes = [
  "combine_objects",
  "append_arrays",
  "merge_by_index",
  "merge_by_key",
  "wait_for_both",
] as const;

const conflictStrategies = ["prefer_a", "prefer_b", "keep_both"] as const;

const formSchema = z
  .object({
    mode: z.enum(mergeModes),
    keyField: z.string().optional(),
    conflictStrategy: z.enum(conflictStrategies),
    inputAPath: z.string().min(1, "Source A variable is required"),
    inputBPath: z.string().min(1, "Source B variable is required"),
    outputVariableName: z.string().min(1, "Output variable is required"),
  })
  .superRefine((values, ctx) => {
    if (
      values.mode === "merge_by_key" &&
      !String(values.keyField ?? "").trim()
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["keyField"],
        message: "Key field is required for Merge by Key mode.",
      });
    }
  });

export type MergeNodeFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: MergeNodeFormValues) => void;
  defaultValues?: Partial<MergeNodeFormValues>;
}

export function MergeNodeDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) {
  const form = useForm<MergeNodeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mode: defaultValues.mode ?? "combine_objects",
      keyField: defaultValues.keyField ?? "",
      conflictStrategy: defaultValues.conflictStrategy ?? "prefer_b",
      inputAPath: defaultValues.inputAPath ?? "",
      inputBPath: defaultValues.inputBPath ?? "",
      outputVariableName: defaultValues.outputVariableName ?? "merged",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      mode: defaultValues.mode ?? "combine_objects",
      keyField: defaultValues.keyField ?? "",
      conflictStrategy: defaultValues.conflictStrategy ?? "prefer_b",
      inputAPath: defaultValues.inputAPath ?? "",
      inputBPath: defaultValues.inputBPath ?? "",
      outputVariableName: defaultValues.outputVariableName ?? "merged",
    });
  }, [defaultValues, form, open]);

  const mode = form.watch("mode");

  const handleSubmit = (values: MergeNodeFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] min-h-0 w-[min(96vw,44rem)] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle>Merge</DialogTitle>
          <DialogDescription>
            Combine two input datasets into one output.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <Form {...form}>
            <form
              id="merge-node-form"
              onSubmit={form.handleSubmit(handleSubmit)}
              className="mt-1 space-y-5 px-6 py-5"
            >
              <FormField
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Merge Mode</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="combine_objects">
                          Combine Objects
                        </SelectItem>
                        <SelectItem value="append_arrays">
                          Append Arrays
                        </SelectItem>
                        <SelectItem value="merge_by_index">
                          Merge by Index
                        </SelectItem>
                        <SelectItem value="merge_by_key">
                          Merge by Key
                        </SelectItem>
                        <SelectItem value="wait_for_both">
                          Wait for Both Inputs
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Choose how source A and source B should be combined.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="inputAPath"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source A Variable</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="jobsA or {{jobsApi.httpResponse.data}}"
                      />
                    </FormControl>
                    <FormDescription>
                      First input to merge. Supports template/path references.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="inputBPath"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source B Variable</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="jobsB or {{enrichmentApi.httpResponse.data}}"
                      />
                    </FormControl>
                    <FormDescription>
                      Second input to merge. Must resolve to a compatible value.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {mode === "merge_by_key" && (
                <FormField
                  control={form.control}
                  name="keyField"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Key Field</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="id" />
                      </FormControl>
                      <FormDescription>
                        Field used to match records in both arrays (example:
                        id).
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="conflictStrategy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conflict Strategy</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="prefer_a">Prefer A</SelectItem>
                        <SelectItem value="prefer_b">Prefer B</SelectItem>
                        <SelectItem value="keep_both">Keep Both</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Decide which value wins when both sources provide the same
                      key.
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
                    <FormLabel>Output Variable</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="merged" />
                    </FormControl>
                    <FormDescription>
                      Result is available in next nodes as{" "}
                      {"{{outputVariableName}}"}.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                <p>
                  Validation checks at execution time include missing second
                  input, incompatible data types, and key mismatches.
                </p>
              </div>
            </form>
          </Form>
        </div>
        <DialogFooter className="sticky bottom-0 z-10 shrink-0 border-t bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button type="submit" form="merge-node-form">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
