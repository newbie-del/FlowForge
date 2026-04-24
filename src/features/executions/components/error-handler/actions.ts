"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { errorHandlerNodeChannel } from "@/inngest/channels/error-handler-node";
import { inngest } from "@/inngest/client";

export type ErrorHandlerNodeToken = Realtime.Token<
  typeof errorHandlerNodeChannel,
  ["status"]
>;

export async function fetchErrorHandlerRealtimeToken(): Promise<ErrorHandlerNodeToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: errorHandlerNodeChannel(),
    topics: ["status"],
  });

  return token;
}
