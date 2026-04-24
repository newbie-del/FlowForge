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

const formSchema = z
  .object({
    variableName: z
      .string()
      .min(1, "Variable name is required")
      .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
        message:
          "Variable name must start with a letter or underscore and contain only alphanumeric characters.",
      }),
    minDelay: z.number().int().min(0),
    maxDelay: z.number().int().min(0),
    mode: z.enum(["seconds", "minutes"]),
    showGeneratedDelay: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.maxDelay < values.minDelay) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxDelay"],
        message: "Max delay must be greater than or equal to min delay.",
      });
    }
  });

export type RandomDelayFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: RandomDelayFormValues) => void;
  defaultValues?: Partial<RandomDelayFormValues>;
}

export function RandomDelayDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) {
  const form = useForm<RandomDelayFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variableName: defaultValues.variableName ?? "randomDelay",
      minDelay: defaultValues.minDelay ?? 10,
      maxDelay: defaultValues.maxDelay ?? 45,
      mode: defaultValues.mode ?? "seconds",
      showGeneratedDelay: defaultValues.showGeneratedDelay ?? true,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      variableName: defaultValues.variableName ?? "randomDelay",
      minDelay: defaultValues.minDelay ?? 10,
      maxDelay: defaultValues.maxDelay ?? 45,
      mode: defaultValues.mode ?? "seconds",
      showGeneratedDelay: defaultValues.showGeneratedDelay ?? true,
    });
  }, [defaultValues, form, open]);

  const mode = form.watch("mode");

  const handleSubmit = (values: RandomDelayFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] min-h-0 w-[min(96vw,36rem)] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle>Random Delay</DialogTitle>
          <DialogDescription>
            Add a human-like random wait before continuing.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <Form {...form}>
            <form
              id="random-delay-form"
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
                      <Input {...field} placeholder="randomDelay" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="minDelay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Min Delay</FormLabel>
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
                  name="maxDelay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Delay</FormLabel>
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
                        <SelectItem value="seconds">Seconds</SelectItem>
                        <SelectItem value="minutes">Minutes</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      A random value between min and max {mode} is generated.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="showGeneratedDelay"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FormLabel>Show generated delay</FormLabel>
                      <FormDescription>
                        Include generated delay metadata in node output.
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
          <Button type="submit" form="random-delay-form">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
