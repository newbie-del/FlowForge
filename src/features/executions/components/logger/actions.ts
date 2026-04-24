"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { loggerNodeChannel } from "@/inngest/channels/logger-node";
import { inngest } from "@/inngest/client";

export type LoggerNodeToken = Realtime.Token<
  typeof loggerNodeChannel,
  ["status"]
>;

export async function fetchLoggerRealtimeToken(): Promise<LoggerNodeToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: loggerNodeChannel(),
    topics: ["status"],
  });

  return token;
}
