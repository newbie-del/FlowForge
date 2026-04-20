"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { setNodeChannel } from "@/inngest/channels/set-node";

export type SetNodeToken = Realtime.Token<typeof setNodeChannel, ["status"]>;

export async function fetchSetNodeRealtimeToken(): Promise<SetNodeToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: setNodeChannel(),
    topics: ["status"],
  });

  return token;
}
