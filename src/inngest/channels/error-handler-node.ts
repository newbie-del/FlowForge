import { channel, topic } from "@inngest/realtime";

export const ERROR_HANDLER_NODE_CHANNEL_NAME = "error-handler-node-execution";

export const errorHandlerNodeChannel = channel(
  ERROR_HANDLER_NODE_CHANNEL_NAME,
).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
  }>(),
);
