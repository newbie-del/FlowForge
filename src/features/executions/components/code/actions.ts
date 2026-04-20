"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { codeNodeChannel } from "@/inngest/channels/code-node";

export type CodeNodeToken = Realtime.Token<typeof codeNodeChannel, ["status"]>;

export async function fetchCodeNodeRealtimeToken(): Promise<CodeNodeToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: codeNodeChannel(),
    topics: ["status"],
  });

  return token;
}
