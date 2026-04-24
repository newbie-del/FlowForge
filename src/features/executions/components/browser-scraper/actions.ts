"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { browserScraperNodeChannel } from "@/inngest/channels/browser-scraper-node";
import { inngest } from "@/inngest/client";

export type BrowserScraperNodeToken = Realtime.Token<
  typeof browserScraperNodeChannel,
  ["status"]
>;

export async function fetchBrowserScraperRealtimeToken(): Promise<BrowserScraperNodeToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: browserScraperNodeChannel(),
    topics: ["status"],
  });

  return token;
}
