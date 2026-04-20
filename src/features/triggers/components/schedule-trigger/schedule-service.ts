import "server-only";

import { CronExpressionParser } from "cron-parser";
import z from "zod";
import {
  type ScheduleMode,
  type ScheduleTriggerData,
  scheduleModeValues,
} from "./types";

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const scheduleDataSchema = z.object({
  mode: z.enum(scheduleModeValues).default("daily"),
  interval: z.number().int().positive().default(1),
  time: z.string().regex(timePattern).default("09:00"),
  timezone: z.string().min(1).default("UTC"),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).default([1]),
  dayOfMonth: z.number().int().min(1).max(31).default(1),
  cronExpression: z.string().default(""),
  enabled: z.boolean().default(true),
  runImmediately: z.boolean().default(false),
  runMissedOnRestart: z.boolean().default(false),
});

export type NormalizedScheduleData = z.infer<typeof scheduleDataSchema>;

export type ScheduleValidationResult =
  | { valid: true; normalized: NormalizedScheduleData; cronExpression: string }
  | { valid: false; error: string; normalized: NormalizedScheduleData };

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function parseHourMinute(value: string) {
  const match = value.match(timePattern);
  if (!match) {
    return { hour: 9, minute: 0 };
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function formatCron(data: NormalizedScheduleData) {
  const { hour, minute } = parseHourMinute(data.time);

  switch (data.mode) {
    case "every_minutes": {
      const interval = Math.max(1, data.interval);
      if (interval > 59) {
        throw new Error("Every Minutes interval must be between 1 and 59.");
      }
      return interval === 1 ? `0 * * * * *` : `0 */${interval} * * * *`;
    }
    case "hourly": {
      const interval = Math.max(1, data.interval);
      if (interval > 23) {
        throw new Error("Hourly interval must be between 1 and 23.");
      }
      return `0 ${minute} */${interval} * * *`;
    }
    case "daily":
      return `0 ${minute} ${hour} * * *`;
    case "weekly": {
      const days = [...new Set(data.daysOfWeek)].sort((a, b) => a - b);
      if (days.length === 0) {
        throw new Error("Select at least one day for weekly schedule.");
      }
      return `0 ${minute} ${hour} * * ${days.join(",")}`;
    }
    case "monthly":
      return `0 ${minute} ${hour} ${data.dayOfMonth} * *`;
    case "weekdays_only":
      return `0 ${minute} ${hour} * * 1-5`;
    case "custom_cron":
      if (!data.cronExpression.trim()) {
        throw new Error("Cron expression is required in Custom Cron mode.");
      }
      return data.cronExpression.trim();
    default:
      return `0 ${minute} ${hour} * * *`;
  }
}

export function normalizeScheduleData(
  rawData: Record<string, unknown> | ScheduleTriggerData,
): ScheduleValidationResult {
  const parsed = scheduleDataSchema.safeParse({
    mode: rawData.mode,
    interval:
      typeof rawData.interval === "number"
        ? rawData.interval
        : Number(rawData.interval ?? 1),
    time: typeof rawData.time === "string" ? rawData.time : "09:00",
    timezone:
      typeof rawData.timezone === "string" ? rawData.timezone.trim() : "UTC",
    daysOfWeek: Array.isArray(rawData.daysOfWeek)
      ? rawData.daysOfWeek.map((value) => Number(value))
      : [1],
    dayOfMonth:
      typeof rawData.dayOfMonth === "number"
        ? rawData.dayOfMonth
        : Number(rawData.dayOfMonth ?? 1),
    cronExpression:
      typeof rawData.cronExpression === "string" ? rawData.cronExpression : "",
    enabled:
      typeof rawData.enabled === "boolean"
        ? rawData.enabled
        : rawData.enabled !== "false",
    runImmediately:
      typeof rawData.runImmediately === "boolean"
        ? rawData.runImmediately
        : rawData.runImmediately === "true",
    runMissedOnRestart:
      typeof rawData.runMissedOnRestart === "boolean"
        ? rawData.runMissedOnRestart
        : rawData.runMissedOnRestart === "true",
  });

  if (!parsed.success) {
    const fallback = scheduleDataSchema.parse({});
    return {
      valid: false,
      error: parsed.error.issues[0]?.message ?? "Invalid schedule settings.",
      normalized: fallback,
    };
  }

  const normalized = parsed.data;

  if (!isValidTimezone(normalized.timezone)) {
    return {
      valid: false,
      error: `Invalid timezone: ${normalized.timezone}`,
      normalized,
    };
  }

  try {
    const cronExpression = formatCron(normalized);
    CronExpressionParser.parse(cronExpression, {
      currentDate: new Date(),
      tz: normalized.timezone,
    });

    return {
      valid: true,
      normalized,
      cronExpression,
    };
  } catch (error) {
    return {
      valid: false,
      error:
        error instanceof Error
          ? error.message
          : "Invalid cron expression configuration.",
      normalized,
    };
  }
}

export function getNextRuns(params: {
  cronExpression: string;
  timezone: string;
  count?: number;
  from?: Date;
}) {
  const count = params.count ?? 5;
  const fromDate = params.from ?? new Date();
  const expression = CronExpressionParser.parse(params.cronExpression, {
    currentDate: fromDate,
    tz: params.timezone,
  });

  return expression
    .take(count)
    .map((item) => item.toDate())
    .filter((date) => !Number.isNaN(date.getTime()));
}

export function getNextRunAt(params: {
  cronExpression: string;
  timezone: string;
  from?: Date;
}) {
  return (
    getNextRuns({
      cronExpression: params.cronExpression,
      timezone: params.timezone,
      count: 1,
      from: params.from,
    })[0] ?? null
  );
}

export function buildScheduleTriggerMetadata(params: {
  mode: ScheduleMode;
  timezone: string;
  runAt?: Date;
}) {
  const runAt = params.runAt ?? new Date();
  return {
    triggerType: "schedule",
    runAt: runAt.toISOString(),
    timezone: params.timezone,
    scheduleMode: params.mode,
  };
}
