import { channel, topic } from "@inngest/realtime";

export const LOOP_OVER_ITEMS_CHANNEL_NAME = "loop-over-items-execution";

export const loopOverItemsChannel = channel(
  LOOP_OVER_ITEMS_CHANNEL_NAME,
).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
    processed?: number;
    totalItems?: number;
    failed?: number;
  }>(),
);
