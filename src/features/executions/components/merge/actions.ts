"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { mergeNodeChannel } from "@/inngest/channels/merge-node";

export type MergeNodeToken = Realtime.Token<typeof mergeNodeChannel, ["status"]>;

export async function fetchMergeNodeRealtimeToken(): Promise<MergeNodeToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: mergeNodeChannel(),
    topics: ["status"],
  });

  return token;
}
