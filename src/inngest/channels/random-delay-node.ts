import { channel, topic } from "@inngest/realtime";

export const RANDOM_DELAY_NODE_CHANNEL_NAME = "random-delay-node-execution";

export const randomDelayNodeChannel = channel(
  RANDOM_DELAY_NODE_CHANNEL_NAME,
).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
    generatedDelay?: number;
    unit?: "seconds" | "minutes";
  }>(),
);
