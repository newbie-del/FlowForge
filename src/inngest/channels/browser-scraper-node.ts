import { channel, topic } from "@inngest/realtime";

export const BROWSER_SCRAPER_NODE_CHANNEL_NAME =
  "browser-scraper-node-execution";

export const browserScraperNodeChannel = channel(
  BROWSER_SCRAPER_NODE_CHANNEL_NAME,
).addTopic(
  topic("status").type<{
    nodeId: string;
    status: "loading" | "success" | "error";
  }>(),
);
