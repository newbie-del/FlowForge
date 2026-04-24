import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import { randomDelayNodeChannel } from "@/inngest/channels/random-delay-node";

type RandomDelayNodeData = {
  variableName?: string;
  minDelay?: number;
  maxDelay?: number;
  mode?: "seconds" | "minutes";
  showGeneratedDelay?: boolean;
};

function getRandomIntInclusive(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const randomDelayExecutor: NodeExecutor<RandomDelayNodeData> = async ({
  data,
  nodeId,
  context,
  step,
  publish,
}) => {
  await publish(
    randomDelayNodeChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  try {
    const variableName = String(data.variableName ?? "randomDelay").trim();
    const mode = data.mode === "minutes" ? "minutes" : "seconds";
    const minDelay = Number(data.minDelay ?? 1);
    const maxDelay = Number(data.maxDelay ?? 5);
    const showGeneratedDelay = Boolean(data.showGeneratedDelay ?? true);

    if (!variableName) {
      throw new NonRetriableError(
        "RANDOM DELAY node variableName is required.",
      );
    }
    if (!Number.isFinite(minDelay) || !Number.isFinite(maxDelay)) {
      throw new NonRetriableError(
        "RANDOM DELAY node min/max delay must be numbers.",
      );
    }
    if (minDelay < 0 || maxDelay < 0) {
      throw new NonRetriableError(
        "RANDOM DELAY node delay values cannot be negative.",
      );
    }
    if (maxDelay < minDelay) {
      throw new NonRetriableError(
        "RANDOM DELAY node max delay must be >= min delay.",
      );
    }

    const generatedDelay = getRandomIntInclusive(
      Math.floor(minDelay),
      Math.floor(maxDelay),
    );
    const waitSeconds = generatedDelay * (mode === "minutes" ? 60 : 1);
    if (waitSeconds > 0) {
      await step.sleep(`random-delay-${nodeId}`, `${waitSeconds}s`);
    }

    await publish(
      randomDelayNodeChannel().status({
        nodeId,
        status: "success",
        generatedDelay,
        unit: mode,
      }),
    );

    return {
      ...context,
      [variableName]: {
        waited: generatedDelay,
        unit: mode,
        waitSeconds,
        generatedDelayShown: showGeneratedDelay,
      },
    };
  } catch (error) {
    await publish(
      randomDelayNodeChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
