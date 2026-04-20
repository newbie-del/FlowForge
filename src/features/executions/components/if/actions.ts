"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { ifNodeChannel } from "@/inngest/channels/if-node";
import { inngest } from "@/inngest/client";

export type IfNodeRealtimeToken = Realtime.Token<
  typeof ifNodeChannel,
  ["status"]
>;

export async function fetchIfNodeRealtimeToken(): Promise<IfNodeRealtimeToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: ifNodeChannel(),
    topics: ["status"],
  });

  return token;
}
