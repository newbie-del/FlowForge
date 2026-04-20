"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { waitNodeChannel } from "@/inngest/channels/wait-node";
import { inngest } from "@/inngest/client";

export type WaitNodeRealtimeToken = Realtime.Token<
  typeof waitNodeChannel,
  ["status"]
>;

export async function fetchWaitNodeRealtimeToken(): Promise<WaitNodeRealtimeToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: waitNodeChannel(),
    topics: ["status"],
  });

  return token;
}
