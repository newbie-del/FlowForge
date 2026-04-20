"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
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
import { type IfOperator, ifOperators } from "./executor";

const operatorLabels: Record<IfOperator, string> = {
  equals: "Equals",
  not_equals: "Not equals",
  contains: "Contains",
  not_contains: "Not contains",
  starts_with: "Starts with",
  ends_with: "Ends with",
  greater_than: "Greater than",
  less_than: "Less than",
  greater_or_equal: "Greater or equal",
  less_or_equal: "Less or equal",
  is_empty: "Is empty",
  is_not_empty: "Is not empty",
  exists: "Exists",
  not_exists: "Not exists",
};

const operatorsWithoutRightValue = new Set<IfOperator>([
  "is_empty",
  "is_not_empty",
  "exists",
  "not_exists",
]);

const conditionSchema = z.object({
  leftValue: z.string().min(1, "Left value is required"),
  operator: z.enum(ifOperators),
  rightValue: z.string().optional(),
});

const formSchema = z.object({
  combineOperation: z.enum(["all", "any"]),
  caseSensitive: z.boolean(),
  conditions: z
    .array(conditionSchema)
    .min(1, "At least one condition is required"),
});

export type IfNodeFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: IfNodeFormValues) => void;
  defaultValues?: Partial<IfNodeFormValues> & {
    leftValue?: string;
    operator?: IfOperator;
    rightValue?: string;
  };
}

function getDefaultConditions(defaultValues?: Props["defaultValues"]) {
  if (defaultValues?.conditions?.length) {
    return defaultValues.conditions;
  }

  return [
    {
      leftValue: defaultValues?.leftValue ?? "",
      operator: defaultValues?.operator ?? "equals",
      rightValue: defaultValues?.rightValue ?? "",
    },
  ];
}

export function IfNodeDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) {
  const form = useForm<IfNodeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      combineOperation: defaultValues.combineOperation ?? "all",
      caseSensitive: Boolean(defaultValues.caseSensitive ?? false),
      conditions: getDefaultConditions(defaultValues),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "conditions",
  });

  useEffect(() => {
    if (!open) return;

    form.reset({
      combineOperation: defaultValues.combineOperation ?? "all",
      caseSensitive: Boolean(defaultValues.caseSensitive ?? false),
      conditions: getDefaultConditions(defaultValues),
    });
  }, [defaultValues, form, open]);

  const handleSubmit = (values: IfNodeFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col overflow-hidden min-h-0">
        <DialogHeader className="shrink-0">
          <DialogTitle>IF</DialogTitle>
          <DialogDescription>
            Route the workflow to TRUE or FALSE output based on condition
            checks.
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
                name="combineOperation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Multiple conditions mode</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) =>
                        field.onChange(value as "all" | "any")
                      }
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose mode" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="all">
                          ALL (every condition must match)
                        </SelectItem>
                        <SelectItem value="any">
                          ANY (at least one condition matches)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="caseSensitive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FormLabel>Case sensitive</FormLabel>
                      <FormDescription>
                        Apply exact casing in string operators (equals,
                        contains, starts with, ends with).
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

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <FormLabel>Conditions</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      append({
                        leftValue: "",
                        operator: "equals",
                        rightValue: "",
                      })
                    }
                  >
                    <PlusIcon className="size-4" />
                    Add condition
                  </Button>
                </div>

                {fields.map((fieldItem, index) => {
                  const operator = form.watch(`conditions.${index}.operator`);
                  const hideRight = operatorsWithoutRightValue.has(operator);

                  return (
                    <div
                      key={fieldItem.id}
                      className="rounded-md border p-3 space-y-3"
                    >
                      <FormField
                        control={form.control}
                        name={`conditions.${index}.leftValue`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Left value</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="{{status}} or {{user.name}}"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`conditions.${index}.operator`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Operator</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={(value) =>
                                field.onChange(value as IfOperator)
                              }
                            >
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select operator" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {ifOperators.map((operatorKey) => (
                                  <SelectItem
                                    key={operatorKey}
                                    value={operatorKey}
                                  >
                                    {operatorLabels[operatorKey]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {!hideRight && (
                        <FormField
                          control={form.control}
                          name={`conditions.${index}.rightValue`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Right value</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Approved, 1000, @gmail.com"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          onClick={() => remove(index)}
                        >
                          <Trash2Icon className="size-4" />
                          Remove
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>

              <DialogFooter className="mt-4 pb-0 shrink-0">
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
