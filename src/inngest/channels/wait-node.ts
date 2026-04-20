import { channel, topic } from "@inngest/realtime";

export const WAIT_NODE_CHANNEL_NAME = "wait-node-execution";

export const waitNodeChannel = channel(WAIT_NODE_CHANNEL_NAME).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
  }>(),
);
