import { channel, topic } from "@inngest/realtime";

export const IF_NODE_CHANNEL_NAME = "if-node-execution";

export const ifNodeChannel = channel(IF_NODE_CHANNEL_NAME).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
  }>(),
);
