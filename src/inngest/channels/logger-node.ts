import { channel, topic } from "@inngest/realtime";

export const LOGGER_NODE_CHANNEL_NAME = "logger-node-execution";

export const loggerNodeChannel = channel(LOGGER_NODE_CHANNEL_NAME).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
  }>(),
);
