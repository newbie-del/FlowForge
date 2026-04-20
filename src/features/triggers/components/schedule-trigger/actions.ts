"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { headers } from "next/headers";
import { NodeType } from "@/generated/prisma";
import { scheduleTriggerChannel } from "@/inngest/channels/schedule-trigger";
import { inngest } from "@/inngest/client";
import { sendWorkflowExecution } from "@/inngest/utils";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import {
  buildScheduleTriggerMetadata,
  getNextRuns,
  normalizeScheduleData,
} from "./schedule-service";
import type { ScheduleTriggerData } from "./types";

export type ScheduleTriggerToken = Realtime.Token<
  typeof scheduleTriggerChannel,
  ["status"]
>;

async function requireUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  return session.user.id;
}

export async function fetchScheduleTriggerRealtimeToken(): Promise<ScheduleTriggerToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: scheduleTriggerChannel(),
    topics: ["status"],
  });

  return token;
}

export async function previewScheduleRunsAction(input: {
  data: ScheduleTriggerData;
}) {
  await requireUserId();

  const validation = normalizeScheduleData(input.data);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const runs = getNextRuns({
    cronExpression: validation.cronExpression,
    timezone: validation.normalized.timezone,
    count: 5,
  });

  return {
    cronExpression: validation.cronExpression,
    timezone: validation.normalized.timezone,
    runs: runs.map((date) => date.toISOString()),
  };
}

export async function testScheduleTriggerAction(input: {
  workflowId: string;
  nodeId: string;
  data: ScheduleTriggerData;
}) {
  const userId = await requireUserId();

  const workflow = await prisma.workflow.findUnique({
    where: {
      id: input.workflowId,
      userId,
    },
    include: {
      nodes: true,
    },
  });

  if (!workflow) {
    throw new Error("Workflow not found");
  }

  const triggerNode = workflow.nodes.find(
    (node) =>
      node.id === input.nodeId && node.type === NodeType.SCHEDULE_TRIGGER,
  );

  if (!triggerNode) {
    throw new Error("Schedule trigger node not found");
  }

  const validation = normalizeScheduleData(input.data);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  await sendWorkflowExecution({
    workflowId: input.workflowId,
    initialData: {
      schedule: buildScheduleTriggerMetadata({
        mode: validation.normalized.mode,
        timezone: validation.normalized.timezone,
      }),
    },
    source: "schedule-test",
    sourceNodeId: input.nodeId,
    trigger: buildScheduleTriggerMetadata({
      mode: validation.normalized.mode,
      timezone: validation.normalized.timezone,
    }),
  });

  return {
    ok: true,
    message: "Schedule test execution queued.",
  };
}
