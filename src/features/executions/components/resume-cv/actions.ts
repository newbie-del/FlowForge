"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { resumeCvNodeChannel } from "@/inngest/channels/resume-cv-node";
import { inngest } from "@/inngest/client";

export type ResumeCvNodeToken = Realtime.Token<
  typeof resumeCvNodeChannel,
  ["status"]
>;

export async function fetchResumeCvRealtimeToken(): Promise<ResumeCvNodeToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: resumeCvNodeChannel(),
    topics: ["status"],
  });

  return token;
}
