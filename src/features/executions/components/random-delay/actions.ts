"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { randomDelayNodeChannel } from "@/inngest/channels/random-delay-node";
import { inngest } from "@/inngest/client";

export type RandomDelayNodeToken = Realtime.Token<
  typeof randomDelayNodeChannel,
  ["status"]
>;

export async function fetchRandomDelayRealtimeToken(): Promise<RandomDelayNodeToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: randomDelayNodeChannel(),
    topics: ["status"],
  });

  return token;
}
