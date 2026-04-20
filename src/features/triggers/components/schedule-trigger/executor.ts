import type { NodeExecutor } from "@/features/executions/types";
import { scheduleTriggerChannel } from "@/inngest/channels/schedule-trigger";

type ScheduleTriggerData = Record<string, unknown>;

export const scheduleTriggerExecutor: NodeExecutor<
  ScheduleTriggerData
> = async ({ data: _data, nodeId, context, step, publish }) => {
  await publish(
    scheduleTriggerChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  const result = await step.run("schedule-trigger", async () => context);

  await publish(
    scheduleTriggerChannel().status({
      nodeId,
      status: "success",
    }),
  );

  return result;
};
