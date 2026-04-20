import { channel, topic } from "@inngest/realtime";

export const SET_NODE_CHANNEL_NAME = "set-node-execution";

export const setNodeChannel = channel(SET_NODE_CHANNEL_NAME).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
  }>(),
);
