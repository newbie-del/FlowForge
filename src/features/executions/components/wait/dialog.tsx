"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
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
import {
  formatDuration,
  isValidTimezone,
  nextZonedTimeOccurrence,
  type WaitMode,
  waitModes,
  zonedDateTimeToUtc,
} from "./time-utils";

const modeLabels: Record<WaitMode, string> = {
  seconds: "Seconds",
  minutes: "Minutes",
  hours: "Hours",
  until_time: "Until Specific Time",
  until_datetime: "Until DateTime",
};

const commonTimezones = [
  "UTC",
  "Asia/Kolkata",
  "America/New_York",
  "Europe/London",
];

const formSchema = z
  .object({
    mode: z.enum(waitModes),
    duration: z.number().positive().optional(),
    time: z.string().optional(),
    dateTime: z.string().optional(),
    timezone: z.string().min(1, "Timezone is required"),
    continueInTestMode: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (!isValidTimezone(value.timezone)) {
      ctx.addIssue({
        code: "custom",
        path: ["timezone"],
        message: "Invalid timezone identifier.",
      });
    }

    if (
      (value.mode === "seconds" ||
        value.mode === "minutes" ||
        value.mode === "hours") &&
      (!value.duration || value.duration <= 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["duration"],
        message: "Duration must be greater than zero.",
      });
    }

    if (value.mode === "until_time" && !value.time) {
      ctx.addIssue({
        code: "custom",
        path: ["time"],
        message: "Select a time to continue.",
      });
    }

    if (value.mode === "until_datetime" && !value.dateTime) {
      ctx.addIssue({
        code: "custom",
        path: ["dateTime"],
        message: "Select date and time.",
      });
    }
  });

export type WaitNodeFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: WaitNodeFormValues) => void;
  defaultValues?: Partial<WaitNodeFormValues>;
}

function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function toDateTimeLocalString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function WaitNodeDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);

  const form = useForm<WaitNodeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mode: defaultValues.mode ?? "seconds",
      duration: defaultValues.duration ?? 30,
      time: defaultValues.time ?? "09:00",
      dateTime:
        defaultValues.dateTime ??
        toDateTimeLocalString(new Date(Date.now() + 10 * 60 * 1000)),
      timezone: defaultValues.timezone ?? browserTimezone,
      continueInTestMode: defaultValues.continueInTestMode ?? true,
    },
  });

  useEffect(() => {
    if (!open) return;

    form.reset({
      mode: defaultValues.mode ?? "seconds",
      duration: defaultValues.duration ?? 30,
      time: defaultValues.time ?? "09:00",
      dateTime:
        defaultValues.dateTime ??
        toDateTimeLocalString(new Date(Date.now() + 10 * 60 * 1000)),
      timezone: defaultValues.timezone ?? browserTimezone,
      continueInTestMode: defaultValues.continueInTestMode ?? true,
    });
  }, [browserTimezone, defaultValues, form, open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const mode = form.watch("mode");
  const duration = Number(form.watch("duration") ?? 0);
  const time = String(form.watch("time") ?? "");
  const dateTime = String(form.watch("dateTime") ?? "");
  const timezone = String(form.watch("timezone") ?? "UTC");

  const countdownText = useMemo(() => {
    const nowDate = new Date(now);
    if (mode === "seconds" || mode === "minutes" || mode === "hours") {
      if (!duration || duration <= 0) return "Set a valid duration.";
      const multiplier =
        mode === "seconds" ? 1000 : mode === "minutes" ? 60_000 : 3_600_000;
      return `Continues in ~${formatDuration(duration * multiplier)}.`;
    }

    if (!isValidTimezone(timezone)) {
      return "Invalid timezone.";
    }

    if (mode === "until_time") {
      const nextOccurrence = nextZonedTimeOccurrence({
        time,
        timezone,
        now: nowDate,
      });
      if (!nextOccurrence) return "Set a valid time (HH:mm).";
      return `Next continue in ${formatDuration(nextOccurrence.getTime() - nowDate.getTime())}.`;
    }

    const untilDate = zonedDateTimeToUtc(dateTime, timezone);
    if (!untilDate) return "Set a valid date and time.";
    if (untilDate.getTime() <= nowDate.getTime())
      return "Date/time is in the past.";
    return `Continues in ${formatDuration(untilDate.getTime() - nowDate.getTime())}.`;
  }, [dateTime, duration, mode, now, time, timezone]);

  const handleSubmit = (values: WaitNodeFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col overflow-hidden min-h-0">
        <DialogHeader className="shrink-0">
          <DialogTitle>Wait</DialogTitle>
          <DialogDescription>
            Pause workflow execution and continue automatically after the delay.
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
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mode</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) =>
                        field.onChange(value as WaitMode)
                      }
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select wait mode" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {waitModes.map((modeValue) => (
                          <SelectItem key={modeValue} value={modeValue}>
                            {modeLabels[modeValue]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {(mode === "seconds" ||
                mode === "minutes" ||
                mode === "hours") && (
                <FormField
                  control={form.control}
                  name="duration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration</FormLabel>
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

              {mode === "until_time" && (
                <FormField
                  control={form.control}
                  name="time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {mode === "until_datetime" && (
                <FormField
                  control={form.control}
                  name="dateTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date & time</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {(mode === "until_time" || mode === "until_datetime") && (
                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timezone</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          list="wait-node-timezone-options"
                          placeholder="Asia/Kolkata"
                        />
                      </FormControl>
                      <datalist id="wait-node-timezone-options">
                        {commonTimezones.map((zone) => (
                          <option key={zone} value={zone} />
                        ))}
                      </datalist>
                      <FormDescription>
                        Browser timezone detected: {browserTimezone}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="continueInTestMode"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FormLabel>Continue immediately in test mode</FormLabel>
                      <FormDescription>
                        Manual/test executions skip delay while production runs
                        still wait.
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

              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                {countdownText}
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
