export const scheduleModeValues = [
  "every_minutes",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "weekdays_only",
  "custom_cron",
] as const;

export type ScheduleMode = (typeof scheduleModeValues)[number];

export type ScheduleTriggerData = {
  mode?: ScheduleMode;
  interval?: number;
  time?: string;
  timezone?: string;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  cronExpression?: string;
  enabled?: boolean;
  runImmediately?: boolean;
  runMissedOnRestart?: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  totalRuns?: number;
  lastError?: string | null;
  lastResult?: "success" | "failed" | null;
  lastRunDurationMs?: number | null;
  active?: boolean;
  resolvedCronExpression?: string;
  recentRuns?: Array<{
    at: string;
    status: "success" | "failed";
    durationMs?: number;
    error?: string | null;
  }>;
};

export const scheduleModeLabels: Record<ScheduleMode, string> = {
  every_minutes: "Every Minutes",
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  weekdays_only: "Weekdays Only",
  custom_cron: "Custom Cron",
};

export const weeklyDayOptions = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
] as const;

const fallbackTimezones = [
  "UTC",
  "Asia/Kolkata",
  "America/New_York",
  "Europe/London",
];

export function getTimezoneOptions(): string[] {
  if (
    typeof Intl !== "undefined" &&
    "supportedValuesOf" in Intl &&
    typeof Intl.supportedValuesOf === "function"
  ) {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return fallbackTimezones;
    }
  }

  return fallbackTimezones;
}
