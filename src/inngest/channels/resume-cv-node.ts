import { channel, topic } from "@inngest/realtime";

export const RESUME_CV_NODE_CHANNEL_NAME = "resume-cv-node-execution";

export const resumeCvNodeChannel = channel(
  RESUME_CV_NODE_CHANNEL_NAME,
).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
  }>(),
);
