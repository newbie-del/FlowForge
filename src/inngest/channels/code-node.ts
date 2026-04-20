import { channel, topic } from "@inngest/realtime";

export const CODE_NODE_CHANNEL_NAME = "code-node-execution";

export const codeNodeChannel = channel(CODE_NODE_CHANNEL_NAME).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
  }>(),
);
