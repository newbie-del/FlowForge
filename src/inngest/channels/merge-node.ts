import { channel, topic } from "@inngest/realtime";

export const MERGE_NODE_CHANNEL_NAME = "merge-node-execution";

export const mergeNodeChannel = channel(MERGE_NODE_CHANNEL_NAME).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
  }>(),
);
