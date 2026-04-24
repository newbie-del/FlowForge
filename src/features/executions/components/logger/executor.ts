import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import { loggerNodeChannel } from "@/inngest/channels/logger-node";

type LoggerNodeData = {
  variableName?: string;
  level?: "info" | "warning" | "error" | "debug";
  message?: string;
  includeInputPayload?: boolean;
  includeTimestamp?: boolean;
};

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  const safeString = new Handlebars.SafeString(jsonString);
  return safeString;
});

export const loggerExecutor: NodeExecutor<LoggerNodeData> = async ({
  data,
  nodeId,
  context,
  publish,
}) => {
  await publish(
    loggerNodeChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  try {
    const variableName = String(data.variableName ?? "logEntry").trim();
    const level = data.level ?? "info";
    const includeInputPayload = Boolean(data.includeInputPayload ?? false);
    const includeTimestamp = Boolean(data.includeTimestamp ?? true);
    const rawMessage = String(data.message ?? "").trim();

    if (!variableName) {
      throw new NonRetriableError("LOGGER node variableName is required.");
    }

    const message = rawMessage
      ? String(Handlebars.compile(rawMessage)(context))
      : "Workflow log entry";

    const entry = {
      level,
      message,
      timestamp: includeTimestamp ? new Date().toISOString() : undefined,
      payload: includeInputPayload ? context : undefined,
      nodeId,
    };

    if (level === "error") {
      console.error("[flowforge][logger]", entry);
    } else if (level === "warning") {
      console.warn("[flowforge][logger]", entry);
    } else if (level === "debug") {
      console.debug("[flowforge][logger]", entry);
    } else {
      console.info("[flowforge][logger]", entry);
    }

    const existingLogs = Array.isArray(context.__logs)
      ? context.__logs.filter(
          (item) => typeof item === "object" && item !== null,
        )
      : [];
    const nextLogs = [...existingLogs, entry].slice(-200);

    await publish(
      loggerNodeChannel().status({
        nodeId,
        status: "success",
      }),
    );

    return {
      ...context,
      __logs: nextLogs,
      [variableName]: entry,
    };
  } catch (error) {
    await publish(
      loggerNodeChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
