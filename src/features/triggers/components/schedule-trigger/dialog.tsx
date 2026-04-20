"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type Node, useReactFlow } from "@xyflow/react";
import { PauseIcon, PlayIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  previewScheduleRunsAction,
  testScheduleTriggerAction,
} from "./actions";
import {
  getTimezoneOptions,
  type ScheduleTriggerData,
  scheduleModeLabels,
  scheduleModeValues,
  weeklyDayOptions,
} from "./types";

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const cronPattern = /^(\S+\s+){4,5}\S+$/;
const maxRecentRuns = 8;

const formSchema = z
  .object({
    mode: z.enum(scheduleModeValues),
    interval: z.number().int().positive(),
    time: z.string().min(1),
    timezone: z.string().min(1),
    daysOfWeek: z.array(z.number().int().min(0).max(6)),
    dayOfMonth: z.number().int().min(1).max(31),
    cronExpression: z.string(),
    enabled: z.boolean(),
    runImmediately: z.boolean(),
    runMissedOnRestart: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.mode !== "custom_cron" && !timePattern.test(values.time)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["time"],
        message: "Use a valid 24-hour time (HH:mm).",
      });
    }

    if (
      values.mode === "every_minutes" &&
      (values.interval < 1 || values.interval > 59)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["interval"],
        message: "Minutes interval must be between 1 and 59.",
      });
    }

    if (
      values.mode === "hourly" &&
      (values.interval < 1 || values.interval > 23)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["interval"],
        message: "Hourly interval must be between 1 and 23.",
      });
    }

    if (values.mode === "weekly" && values.daysOfWeek.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["daysOfWeek"],
        message: "Select at least one day for weekly schedules.",
      });
    }

    if (values.mode === "custom_cron") {
      const expression = values.cronExpression.trim();
      if (!expression) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cronExpression"],
          message: "Cron expression is required for Custom Cron mode.",
        });
      } else if (!cronPattern.test(expression)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cronExpression"],
          message: "Cron must have 5 or 6 space-separated parts.",
        });
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;
type ScheduleNodeType = Node<ScheduleTriggerData>;

interface Props {
  nodeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: ScheduleTriggerData;
}

type Preset = {
  key: string;
  label: string;
  apply: (timezone: string) => Partial<FormValues>;
};

const presets: Preset[] = [
  {
    key: "every-hour",
    label: "Every Hour",
    apply: () => ({ mode: "hourly", interval: 1, time: "00:00" }),
  },
  {
    key: "morning-9",
    label: "Every Morning 9 AM",
    apply: () => ({ mode: "daily", time: "09:00" }),
  },
  {
    key: "weekday",
    label: "Every Weekday",
    apply: () => ({ mode: "weekdays_only", time: "09:00" }),
  },
  {
    key: "monday-10",
    label: "Every Monday 10 AM",
    apply: () => ({ mode: "weekly", daysOfWeek: [1], time: "10:00" }),
  },
  {
    key: "first-day",
    label: "First Day of Month",
    apply: () => ({ mode: "monthly", dayOfMonth: 1, time: "09:00" }),
  },
];

function detectBrowserTimezone() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timezone?.trim() ? timezone : "UTC";
}

function toDefaults(
  values: ScheduleTriggerData | undefined,
  timezone: string,
): FormValues {
  return {
    mode: values?.mode ?? "daily",
    interval: values?.interval ?? 1,
    time: values?.time ?? "09:00",
    timezone: values?.timezone?.trim() ? values.timezone : timezone,
    daysOfWeek: values?.daysOfWeek?.length ? values.daysOfWeek : [1],
    dayOfMonth: values?.dayOfMonth ?? 1,
    cronExpression: values?.cronExpression ?? "",
    enabled: values?.enabled ?? true,
    runImmediately: values?.runImmediately ?? false,
    runMissedOnRestart: values?.runMissedOnRestart ?? false,
  };
}

function toNodeData(values: FormValues, existing?: ScheduleTriggerData) {
  return {
    ...existing,
    ...values,
  } satisfies ScheduleTriggerData;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}

function formatDurationMs(durationMs: number | undefined) {
  if (!durationMs || durationMs < 1000) {
    return `${durationMs ?? 0}ms`;
  }
  const seconds = Math.round(durationMs / 100) / 10;
  return `${seconds}s`;
}

function getCountdownText(value: string | null | undefined) {
  if (!value) {
    return "Not scheduled";
  }

  const target = new Date(value).getTime();
  if (Number.isNaN(target)) {
    return "Not scheduled";
  }

  const diff = target - Date.now();
  if (diff <= 0) {
    return "Due now";
  }

  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `Next run in ${days}d ${hours}h`;
  }

  return `Next run in ${hours}h ${minutes}m`;
}

export function ScheduleTriggerDialog({
  nodeId,
  open,
  onOpenChange,
  defaultValues,
}: Props) {
  const params = useParams();
  const workflowId = String(params.workflowId ?? "");
  const browserTimezone = useMemo(() => detectBrowserTimezone(), []);
  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);
  const { setNodes } = useReactFlow<ScheduleNodeType>();
  const [previewRuns, setPreviewRuns] = useState<string[]>([]);
  const [previewCron, setPreviewCron] = useState<string>("");
  const [isPreviewing, startPreview] = useTransition();
  const [isTesting, startTest] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toDefaults(defaultValues, browserTimezone),
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset(toDefaults(defaultValues, browserTimezone));
    setPreviewRuns([]);
    setPreviewCron("");
  }, [open, defaultValues, browserTimezone, form]);

  const mode = form.watch("mode");
  const enabled = form.watch("enabled");

  const runtimeStatus = {
    active: Boolean(defaultValues?.active ?? enabled),
    lastRunAt: defaultValues?.lastRunAt ?? null,
    nextRunAt: defaultValues?.nextRunAt ?? null,
    totalRuns: defaultValues?.totalRuns ?? 0,
    lastResult: defaultValues?.lastResult ?? null,
    lastError: defaultValues?.lastError ?? null,
  };

  const submit = (values: FormValues) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        return {
          ...node,
          data: toNodeData(values, node.data as ScheduleTriggerData),
        };
      }),
    );
    onOpenChange(false);
  };

  const runPreview = () => {
    startPreview(async () => {
      try {
        const values = form.getValues();
        const result = await previewScheduleRunsAction({
          data: toNodeData(values, defaultValues),
        });
        setPreviewRuns(result.runs);
        setPreviewCron(result.cronExpression);
        toast.success("Preview generated.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Preview failed.");
      }
    });
  };

  const runTest = () => {
    startTest(async () => {
      try {
        if (!workflowId) {
          throw new Error("Workflow ID not found in current route.");
        }

        const values = form.getValues();
        await testScheduleTriggerAction({
          workflowId,
          nodeId,
          data: toNodeData(values, defaultValues),
        });
        toast.success("Schedule test execution queued.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Test trigger failed.",
        );
      }
    });
  };

  const toggleDay = (day: number) => {
    const currentDays = form.getValues("daysOfWeek");
    const nextDays = currentDays.includes(day)
      ? currentDays.filter((value) => value !== day)
      : [...currentDays, day];
    form.setValue(
      "daysOfWeek",
      nextDays.sort((a, b) => a - b),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const applyPreset = (preset: Preset) => {
    const currentTimezone = form.getValues("timezone") || browserTimezone;
    const nextValues = preset.apply(currentTimezone);
    for (const [key, value] of Object.entries(nextValues)) {
      form.setValue(key as keyof FormValues, value as never, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  };

  const handlePauseResume = () => {
    form.setValue("enabled", !enabled, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const recentRuns = (defaultValues?.recentRuns ?? []).slice(0, maxRecentRuns);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col overflow-hidden min-h-0">
        <DialogHeader className="shrink-0">
          <DialogTitle>Schedule Trigger</DialogTitle>
          <DialogDescription>
            Premium scheduler with presets, recovery behavior, and runtime
            monitoring.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(submit)}
              className="space-y-6 mt-4 px-6 pb-6"
            >
              <div className="space-y-2">
                <div className="text-sm font-medium">Smart Presets</div>
                <div className="flex flex-wrap gap-2">
                  {presets.map((preset) => (
                    <Button
                      key={preset.key}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyPreset(preset)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              <FormField
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mode</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select schedule mode" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {scheduleModeValues.map((value) => (
                          <SelectItem key={value} value={value}>
                            {scheduleModeLabels[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {(mode === "every_minutes" || mode === "hourly") && (
                <FormField
                  control={form.control}
                  name="interval"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interval</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={mode === "every_minutes" ? 59 : 23}
                          value={field.value}
                          onChange={(event) =>
                            field.onChange(Number(event.target.value))
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        {mode === "every_minutes"
                          ? "Run every X minutes (1-59)."
                          : "Run every X hours (1-23), at selected minute."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {mode !== "custom_cron" && (
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

              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timezone</FormLabel>
                    <FormControl>
                      <Input
                        list="schedule-timezone-options"
                        placeholder="Asia/Kolkata"
                        {...field}
                      />
                    </FormControl>
                    <datalist id="schedule-timezone-options">
                      {timezoneOptions.map((timezone) => (
                        <option key={timezone} value={timezone} />
                      ))}
                    </datalist>
                    <FormDescription>
                      Auto-detected: {browserTimezone}. You can override
                      manually.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {mode === "weekly" && (
                <FormField
                  control={form.control}
                  name="daysOfWeek"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Days</FormLabel>
                      <div className="grid grid-cols-4 gap-2">
                        {weeklyDayOptions.map((day) => (
                          <div
                            key={day.value}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Checkbox
                              id={`schedule-day-${day.value}`}
                              checked={field.value.includes(day.value)}
                              onCheckedChange={() => toggleDay(day.value)}
                            />
                            <label htmlFor={`schedule-day-${day.value}`}>
                              {day.label}
                            </label>
                          </div>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {mode === "monthly" && (
                <FormField
                  control={form.control}
                  name="dayOfMonth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date of month</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={31}
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
              )}

              {mode === "custom_cron" && (
                <FormField
                  control={form.control}
                  name="cronExpression"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Cron Expression</FormLabel>
                      <FormControl>
                        <Input placeholder="0 9 * * 1-5" {...field} />
                      </FormControl>
                      <FormDescription>
                        Use 5 or 6-part cron format. Example: 0 9 * * 1-5
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="enabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <FormLabel>Activate Schedule</FormLabel>
                        <FormDescription>
                          Pause or resume automatic runs.
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
                  name="runImmediately"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <FormLabel>Run once after activation</FormLabel>
                        <FormDescription>
                          Run one immediate execution when schedule is
                          activated.
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
              </div>

              <FormField
                control={form.control}
                name="runMissedOnRestart"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FormLabel>Run missed schedules on restart</FormLabel>
                      <FormDescription>
                        If server was offline, recover a missed run once when it
                        starts.
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

              <div className="rounded-md border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Runtime Status</h4>
                  <Badge
                    variant={runtimeStatus.active ? "default" : "secondary"}
                  >
                    {runtimeStatus.active ? "Active" : "Paused"}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">
                      Last Run
                    </div>
                    <div className="font-medium">
                      {formatDateTime(runtimeStatus.lastRunAt)}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">
                      Next Run
                    </div>
                    <div className="font-medium">
                      {formatDateTime(runtimeStatus.nextRunAt)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {getCountdownText(runtimeStatus.nextRunAt)}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">
                      Total Runs
                    </div>
                    <div className="font-medium">{runtimeStatus.totalRuns}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">
                      Last Result
                    </div>
                    <div
                      className={`font-medium ${
                        runtimeStatus.lastResult === "failed"
                          ? "text-destructive"
                          : runtimeStatus.lastResult === "success"
                            ? "text-emerald-600"
                            : ""
                      }`}
                    >
                      {runtimeStatus.lastResult === "failed"
                        ? "Failed"
                        : runtimeStatus.lastResult === "success"
                          ? "Success"
                          : "—"}
                    </div>
                    {runtimeStatus.lastError ? (
                      <div className="text-xs text-destructive mt-1">
                        {runtimeStatus.lastError}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={runPreview}
                  disabled={isPreviewing}
                >
                  Preview next 5 runs
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={runTest}
                  disabled={isTesting}
                >
                  Test Trigger
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePauseResume}
                >
                  {enabled ? (
                    <PauseIcon className="size-4" />
                  ) : (
                    <PlayIcon className="size-4" />
                  )}
                  {enabled ? "Pause Schedule" : "Resume Schedule"}
                </Button>
              </div>

              {previewRuns.length > 0 && (
                <div className="rounded-md border p-3 text-sm space-y-2">
                  <div className="font-medium">
                    Preview ({previewCron || "cron"})
                  </div>
                  <ul className="space-y-1">
                    {previewRuns.map((run) => (
                      <li key={run}>{new Date(run).toLocaleString()}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-md border p-4 space-y-3">
                <h4 className="text-sm font-semibold">Run History</h4>
                {recentRuns.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No recent runs yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentRuns.map((run, index) => (
                      <div
                        key={`${run.at}-${index}`}
                        className="rounded-md border p-3 text-sm grid grid-cols-1 sm:grid-cols-4 gap-2"
                      >
                        <div className="sm:col-span-2">
                          <div className="text-muted-foreground text-xs">
                            Time
                          </div>
                          <div>{formatDateTime(run.at)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">
                            Status
                          </div>
                          <div
                            className={
                              run.status === "failed"
                                ? "text-destructive"
                                : "text-emerald-600"
                            }
                          >
                            {run.status === "failed" ? "Failed" : "Success"}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">
                            Duration
                          </div>
                          <div>{formatDurationMs(run.durationMs)}</div>
                        </div>
                        {run.error ? (
                          <div className="sm:col-span-4 text-xs text-destructive">
                            {run.error}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
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
