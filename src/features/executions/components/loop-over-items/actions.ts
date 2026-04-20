"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { loopOverItemsChannel } from "@/inngest/channels/loop-over-items";

export type LoopOverItemsToken = Realtime.Token<
  typeof loopOverItemsChannel,
  ["status"]
>;

export async function fetchLoopOverItemsRealtimeToken(): Promise<LoopOverItemsToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: loopOverItemsChannel(),
    topics: ["status"],
  });

  return token;
}
