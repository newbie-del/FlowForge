import { NonRetriableError } from "inngest";
import { getExecutionSource } from "@/features/executions/lib/runtime-routing";
import type { NodeExecutor } from "@/features/executions/types";
import { waitNodeChannel } from "@/inngest/channels/wait-node";
import {
  isValidTimezone,
  nextZonedTimeOccurrence,
  type WaitMode,
  zonedDateTimeToUtc,
} from "./time-utils";

type WaitNodeData = {
  mode?: WaitMode;
  duration?: number;
  time?: string;
  dateTime?: string;
  timezone?: string;
  continueInTestMode?: boolean;
};

function isTestExecution(source: string) {
  return source === "manual" || source.includes("test");
}

function resolveWaitUntil(data: WaitNodeData, now: Date) {
  const mode = data.mode ?? "seconds";
  const timezone = typeof data.timezone === "string" ? data.timezone : "UTC";

  if (!isValidTimezone(timezone)) {
    throw new NonRetriableError(`Wait node timezone is invalid: ${timezone}`);
  }

  if (mode === "seconds" || mode === "minutes" || mode === "hours") {
    const duration = Number(data.duration ?? 0);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new NonRetriableError(
        "Wait node duration must be greater than zero.",
      );
    }

    const unitMultiplier =
      mode === "seconds" ? 1000 : mode === "minutes" ? 60_000 : 3_600_000;
    return new Date(now.getTime() + duration * unitMultiplier);
  }

  if (mode === "until_time") {
    const time = String(data.time ?? "").trim();
    if (!time) {
      throw new NonRetriableError(
        "Wait node requires time when mode is 'Until Specific Time'.",
      );
    }
    const nextRun = nextZonedTimeOccurrence({
      time,
      timezone,
      now,
    });
    if (!nextRun) {
      throw new NonRetriableError(
        "Wait node could not resolve the next run time.",
      );
    }
    return nextRun;
  }

  const dateTime = String(data.dateTime ?? "").trim();
  if (!dateTime) {
    throw new NonRetriableError(
      "Wait node requires a date/time when mode is 'Until DateTime'.",
    );
  }
  const untilDate = zonedDateTimeToUtc(dateTime, timezone);
  if (!untilDate || Number.isNaN(untilDate.getTime())) {
    throw new NonRetriableError(
      "Wait node date/time is malformed. Use a valid date and time.",
    );
  }

  if (untilDate <= now) {
    throw new NonRetriableError("Wait node date/time must be in the future.");
  }
  return untilDate;
}

export const waitNodeExecutor: NodeExecutor<WaitNodeData> = async ({
  data,
  nodeId,
  context,
  step,
  publish,
}) => {
  await publish(
    waitNodeChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  try {
    const source = getExecutionSource(context);
    const skipForTest =
      Boolean(data.continueInTestMode) && isTestExecution(source);
    const now = new Date();

    if (!skipForTest) {
      const waitUntil = resolveWaitUntil(data, now);
      const waitSeconds = Math.max(
        1,
        Math.ceil((waitUntil.getTime() - now.getTime()) / 1000),
      );
      await step.sleep(`wait-node-${nodeId}`, `${waitSeconds}s`);
    }

    await publish(
      waitNodeChannel().status({
        nodeId,
        status: "success",
      }),
    );

    return context;
  } catch (error) {
    await publish(
      waitNodeChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
