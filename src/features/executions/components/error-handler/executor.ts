import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import { errorHandlerNodeChannel } from "@/inngest/channels/error-handler-node";

type ErrorHandlerNodeData = {
  variableName?: string;
  errorPath?: string;
  retryCount?: number;
  retryDelaySeconds?: number;
  fallbackMessage?: string;
  continueWorkflow?: boolean;
};

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  const safeString = new Handlebars.SafeString(jsonString);
  return safeString;
});

function parsePathToken(value: string) {
  const tokens: string[] = [];
  const pattern = /([^.[\]]+)|\[(\d+)\]/g;
  for (const match of value.matchAll(pattern)) {
    if (match[1]) tokens.push(match[1]);
    else if (match[2]) tokens.push(match[2]);
  }
  return tokens;
}

function getValueByPath(source: unknown, rawPath: string): unknown {
  if (!rawPath) return undefined;
  const tokens = parsePathToken(rawPath.trim());
  let current: unknown = source;
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(token);
      current = Number.isNaN(index) ? undefined : current[index];
      continue;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[token];
      continue;
    }
    return undefined;
  }
  return current;
}

export const errorHandlerExecutor: NodeExecutor<ErrorHandlerNodeData> = async ({
  data,
  nodeId,
  context,
  step,
  publish,
}) => {
  await publish(
    errorHandlerNodeChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  try {
    const variableName = String(data.variableName ?? "errorHandler").trim();
    const retryCount = Math.floor(Number(data.retryCount ?? 0));
    const retryDelaySeconds = Math.floor(Number(data.retryDelaySeconds ?? 30));
    const continueWorkflow = Boolean(data.continueWorkflow ?? true);
    const fallbackMessageTemplate = String(data.fallbackMessage ?? "").trim();
    const errorPath = String(data.errorPath ?? "__lastError").trim();

    if (!variableName) {
      throw new NonRetriableError(
        "ERROR HANDLER node variableName is required.",
      );
    }
    if (!Number.isFinite(retryCount) || retryCount < 0) {
      throw new NonRetriableError("ERROR HANDLER retry count must be >= 0.");
    }
    if (!Number.isFinite(retryDelaySeconds) || retryDelaySeconds < 0) {
      throw new NonRetriableError("ERROR HANDLER retry delay must be >= 0.");
    }

    const rawError = getValueByPath(context, errorPath);
    const errorMessage =
      rawError instanceof Error
        ? rawError.message
        : typeof rawError === "string"
          ? rawError
          : rawError && typeof rawError === "object"
            ? String(
                (rawError as Record<string, unknown>).error ?? "Unknown error",
              )
            : "";

    const fallbackMessage = fallbackMessageTemplate
      ? String(Handlebars.compile(fallbackMessageTemplate)(context))
      : errorMessage || "Workflow step failed.";

    let retriesAttempted = 0;
    for (let attempt = 0; attempt < retryCount; attempt += 1) {
      retriesAttempted = attempt + 1;
      if (retryDelaySeconds > 0) {
        await step.sleep(
          `error-handler-retry-${nodeId}-${attempt + 1}`,
          `${retryDelaySeconds}s`,
        );
      }
    }

    const payload = {
      failedNode: errorPath,
      error: errorMessage || fallbackMessage,
      timestamp: new Date().toISOString(),
      retriesAttempted,
      retryCount,
      retryDelaySeconds,
      fallbackMessage,
      continueWorkflow,
    };

    await publish(
      errorHandlerNodeChannel().status({
        nodeId,
        status: "success",
      }),
    );

    if (!continueWorkflow) {
      throw new NonRetriableError(fallbackMessage);
    }

    return {
      ...context,
      [variableName]: payload,
    };
  } catch (error) {
    await publish(
      errorHandlerNodeChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
