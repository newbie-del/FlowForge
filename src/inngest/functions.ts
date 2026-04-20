import { NonRetriableError } from "inngest";
import { getExecutor } from "@/features/executions/lib/executor-registry";
import {
  getNodeRoute,
  stripRuntimeState,
  withExecutionSource,
} from "@/features/executions/lib/runtime-routing";
import {
  buildScheduleTriggerMetadata,
  getNextRunAt,
  normalizeScheduleData,
} from "@/features/triggers/components/schedule-trigger/schedule-service";
import { ExecutionStatus, NodeType, type Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import { anthropicChannel } from "./channels/anthropic";
import { discordChannel } from "./channels/discord";
import { emailChannel } from "./channels/email";
import { geminiChannel } from "./channels/gemini";
import { googleFormTriggerChannel } from "./channels/google-form-trigger";
import { googleSheetsChannel } from "./channels/google-sheets";
import { httpRequestChannel } from "./channels/http-request";
import { ifNodeChannel } from "./channels/if-node";
import { manualTriggerChannel } from "./channels/manual-trigger";
import { openAiChannel } from "./channels/openai";
import { scheduleTriggerChannel } from "./channels/schedule-trigger";
import { slackChannel } from "./channels/slack";
import { stripeTriggerChannel } from "./channels/stripe-trigger";
import { telegramChannel } from "./channels/telegram";
import { waitNodeChannel } from "./channels/wait-node";
import { inngest } from "./client";
import { sendWorkflowExecution, topologicalSort } from "./utils";

const asJson = (value: Record<string, unknown>) =>
  value as Prisma.InputJsonValue;

const appendRecentRuns = (
  data: Record<string, unknown>,
  run: {
    at: string;
    status: "success" | "failed";
    durationMs?: number;
    error?: string | null;
  },
) => {
  const existingRuns = Array.isArray(data.recentRuns)
    ? data.recentRuns.filter(
        (item) => typeof item === "object" && item !== null,
      )
    : [];

  return [run, ...existingRuns].slice(0, 8);
};

function isTriggerNodeType(nodeType: NodeType) {
  return (
    nodeType === NodeType.INITIAL ||
    nodeType === NodeType.MANUAL_TRIGGER ||
    nodeType === NodeType.SCHEDULE_TRIGGER ||
    nodeType === NodeType.GOOGLE_FORM_TRIGGER ||
    nodeType === NodeType.STRIPE_TRIGGER
  );
}

function inferExecutionSource(
  initialData: Record<string, unknown>,
  explicitSource?: string,
) {
  if (explicitSource?.trim()) {
    return explicitSource;
  }

  if (initialData.schedule) return "schedule";
  if (initialData.googleForm) return "google-form";
  if (initialData.stripe) return "stripe";
  return "manual";
}

export const executeWorkflow = inngest.createFunction(
  {
    id: "execute-workflow",
    retries: 0, //TODO: Remove in production
    onFailure: async ({ event }) => {
      return prisma.execution.update({
        where: { inngestEventId: event.data.event.id },
        data: {
          status: ExecutionStatus.FAILED,
          error: event.data.error.message,
          errorStack: event.data.error.stack,
        },
      });
    },
  },
  {
    event: "workflows/execute.workflow",
    channels: [
      httpRequestChannel(),
      manualTriggerChannel(),
      scheduleTriggerChannel(),
      googleFormTriggerChannel(),
      stripeTriggerChannel(),
      geminiChannel(),
      openAiChannel(),
      anthropicChannel(),
      discordChannel(),
      slackChannel(),
      emailChannel(),
      googleSheetsChannel(),
      telegramChannel(),
      ifNodeChannel(),
      waitNodeChannel(),
    ],
  },
  async ({ event, step, publish }) => {
    const inngestEventId = event.id;
    const workflowId = event.data.workflowId;

    if (!inngestEventId || !workflowId) {
      throw new NonRetriableError("Event ID or Workflow ID is missing");
    }

    await step.run("create-execution", async () => {
      return prisma.execution.create({
        data: {
          workflowId,
          inngestEventId,
        },
      });
    });

    const preparedWorkflow = await step.run("prepare-workflow", async () => {
      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: { id: workflowId },
        include: {
          nodes: true,
          connections: true,
        },
      });

      return {
        sortedNodes: topologicalSort(workflow.nodes, workflow.connections),
        connections: workflow.connections,
      };
    });

    const userId = await step.run("find-user-id", async () => {
      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: { id: workflowId },
        select: {
          userId: true,
        },
      });

      return workflow.userId;
    });

    const sortedNodes = preparedWorkflow.sortedNodes;
    const workflowConnections = preparedWorkflow.connections;

    const incomingByNodeId = new Map<string, typeof workflowConnections>();
    const outgoingByNodeId = new Map<string, typeof workflowConnections>();

    for (const connection of workflowConnections) {
      const incoming = incomingByNodeId.get(connection.toNodeId) ?? [];
      incoming.push(connection);
      incomingByNodeId.set(connection.toNodeId, incoming);

      const outgoing = outgoingByNodeId.get(connection.fromNodeId) ?? [];
      outgoing.push(connection);
      outgoingByNodeId.set(connection.fromNodeId, outgoing);
    }

    const initialData = (event.data.initialData || {}) as Record<
      string,
      unknown
    >;
    const source = inferExecutionSource(
      initialData,
      typeof event.data.source === "string" ? event.data.source : undefined,
    );
    let context = withExecutionSource(initialData, source);

    const startNodeIds = new Set<string>();
    const sourceNodeId =
      typeof event.data.sourceNodeId === "string"
        ? event.data.sourceNodeId
        : null;

    if (sourceNodeId && sortedNodes.some((node) => node.id === sourceNodeId)) {
      startNodeIds.add(sourceNodeId);
    } else {
      for (const node of sortedNodes) {
        const nodeType = node.type as NodeType;
        const incoming = incomingByNodeId.get(node.id) ?? [];
        if (incoming.length === 0 && isTriggerNodeType(nodeType)) {
          startNodeIds.add(node.id);
        }
      }
      if (startNodeIds.size === 0 && sortedNodes[0]) {
        startNodeIds.add(sortedNodes[0].id);
      }
    }

    const executedNodeIds = new Set<string>();
    const selectedOutputsByNodeId = new Map<string, Set<string>>();

    for (const node of sortedNodes) {
      const incomingConnections = incomingByNodeId.get(node.id) ?? [];
      const shouldExecuteAsStart = startNodeIds.has(node.id);
      const shouldExecuteFromIncoming = incomingConnections.some(
        (connection) => {
          if (!executedNodeIds.has(connection.fromNodeId)) {
            return false;
          }
          const selectedOutputs =
            selectedOutputsByNodeId.get(connection.fromNodeId) ?? null;
          if (!selectedOutputs || selectedOutputs.size === 0) {
            return true;
          }

          const fromOutput = connection.fromOutput || "main";
          return selectedOutputs.has(fromOutput);
        },
      );

      if (!shouldExecuteAsStart && !shouldExecuteFromIncoming) {
        continue;
      }

      const executor = getExecutor(node.type as NodeType);
      context = await executor({
        data: node.data as Record<string, unknown>,
        nodeId: node.id,
        userId,
        context,
        step,
        publish,
      });

      executedNodeIds.add(node.id);
      const routeOutputs = getNodeRoute(context, node.id);
      const fallbackOutputs = new Set(
        (outgoingByNodeId.get(node.id) ?? []).map(
          (connection) => connection.fromOutput || "main",
        ),
      );
      selectedOutputsByNodeId.set(
        node.id,
        routeOutputs?.length ? new Set(routeOutputs) : fallbackOutputs,
      );
    }

    const publicContext = stripRuntimeState(context);

    await step.run("update-execution", async () => {
      return prisma.execution.update({
        where: { inngestEventId, workflowId },
        data: {
          status: ExecutionStatus.SUCCESS,
          completedAt: new Date(),
          output: publicContext as Prisma.InputJsonValue,
        },
      });
    });

    return {
      workflowId,
      result: publicContext,
    };
  },
);

export const dispatchScheduledWorkflows = inngest.createFunction(
  {
    id: "dispatch-scheduled-workflows",
    retries: 0,
  },
  {
    cron: "* * * * *",
  },
  async ({ step }) => {
    const now = new Date();

    const scheduleNodes = await step.run("load-schedule-nodes", async () => {
      return prisma.node.findMany({
        where: {
          type: NodeType.SCHEDULE_TRIGGER,
        },
        select: {
          id: true,
          workflowId: true,
          data: true,
        },
      });
    });

    let triggeredCount = 0;

    for (const node of scheduleNodes) {
      const rawData = ((node.data as Record<string, unknown>) ?? {}) as Record<
        string,
        unknown
      >;
      const validation = normalizeScheduleData(rawData);

      if (!validation.valid) {
        await step.run(`mark-schedule-invalid-${node.id}`, async () => {
          await prisma.node.update({
            where: { id: node.id },
            data: {
              data: asJson({
                ...rawData,
                active: false,
                nextRunAt: null,
                lastError: validation.error,
                lastResult: "failed",
              }),
            },
          });
        });
        continue;
      }

      if (!validation.normalized.enabled) {
        await step.run(`mark-schedule-disabled-${node.id}`, async () => {
          await prisma.node.update({
            where: { id: node.id },
            data: {
              data: asJson({
                ...rawData,
                ...validation.normalized,
                active: false,
                nextRunAt: null,
                resolvedCronExpression: validation.cronExpression,
                lastError: null,
              }),
            },
          });
        });
        continue;
      }

      const runImmediately = validation.normalized.runImmediately;
      const runMissedOnRestart = validation.normalized.runMissedOnRestart;
      const lastRunAtRaw = rawData.lastRunAt;
      const lastRunAt =
        typeof lastRunAtRaw === "string" && lastRunAtRaw
          ? new Date(lastRunAtRaw)
          : null;
      const hasRunBefore = Boolean(
        lastRunAt && !Number.isNaN(lastRunAt.getTime()),
      );

      const nextRunAtRaw = rawData.nextRunAt;
      const nextRunAt =
        typeof nextRunAtRaw === "string" && nextRunAtRaw
          ? new Date(nextRunAtRaw)
          : null;
      const nextRunIsValid = Boolean(
        nextRunAt && !Number.isNaN(nextRunAt.getTime()),
      );
      const resolvedNextRun =
        nextRunIsValid && nextRunAt
          ? nextRunAt
          : getNextRunAt({
              cronExpression: validation.cronExpression,
              timezone: validation.normalized.timezone,
              from: now,
            });

      const shouldRunNow =
        (runImmediately && !hasRunBefore) ||
        (resolvedNextRun ? resolvedNextRun <= now : false);
      const isMissedRun = Boolean(
        resolvedNextRun &&
          resolvedNextRun < now &&
          !(runImmediately && !hasRunBefore),
      );

      if (isMissedRun && !runMissedOnRestart) {
        const nextRunAfterSkip = getNextRunAt({
          cronExpression: validation.cronExpression,
          timezone: validation.normalized.timezone,
          from: new Date(now.getTime() + 1000),
        });

        await step.run(`skip-missed-run-${node.id}`, async () => {
          await prisma.node.update({
            where: { id: node.id },
            data: {
              data: asJson({
                ...rawData,
                ...validation.normalized,
                active: true,
                nextRunAt: nextRunAfterSkip?.toISOString() ?? null,
                resolvedCronExpression: validation.cronExpression,
              }),
            },
          });
        });
        continue;
      }

      if (!shouldRunNow) {
        if (!nextRunIsValid && resolvedNextRun) {
          await step.run(`sync-next-run-${node.id}`, async () => {
            await prisma.node.update({
              where: { id: node.id },
              data: {
                data: asJson({
                  ...rawData,
                  ...validation.normalized,
                  active: true,
                  nextRunAt: resolvedNextRun.toISOString(),
                  resolvedCronExpression: validation.cronExpression,
                  lastError: null,
                }),
              },
            });
          });
        }
        continue;
      }

      const runAt = now;
      const runMetadata = buildScheduleTriggerMetadata({
        mode: validation.normalized.mode,
        timezone: validation.normalized.timezone,
        runAt,
      });
      const dispatchStartedAt = Date.now();

      try {
        await step.run(`dispatch-schedule-${node.id}`, async () => {
          await sendWorkflowExecution({
            workflowId: node.workflowId,
            initialData: {
              schedule: runMetadata,
            },
            trigger: runMetadata,
            source: "schedule",
            sourceNodeId: node.id,
          });
        });

        const nextRunAfterDispatch = getNextRunAt({
          cronExpression: validation.cronExpression,
          timezone: validation.normalized.timezone,
          from: new Date(runAt.getTime() + 1000),
        });

        await step.run(`update-schedule-runtime-${node.id}`, async () => {
          const totalRuns =
            typeof rawData.totalRuns === "number" ? rawData.totalRuns : 0;
          const durationMs = Date.now() - dispatchStartedAt;
          const recentRuns = appendRecentRuns(rawData, {
            at: runAt.toISOString(),
            status: "success",
            durationMs,
            error: null,
          });
          await prisma.node.update({
            where: { id: node.id },
            data: {
              data: asJson({
                ...rawData,
                ...validation.normalized,
                active: true,
                resolvedCronExpression: validation.cronExpression,
                lastRunAt: runAt.toISOString(),
                nextRunAt: nextRunAfterDispatch?.toISOString() ?? null,
                totalRuns: totalRuns + 1,
                lastError: null,
                lastResult: "success",
                lastRunDurationMs: durationMs,
                recentRuns,
              }),
            },
          });
        });

        triggeredCount += 1;
      } catch (error) {
        await step.run(`update-schedule-error-${node.id}`, async () => {
          const durationMs = Date.now() - dispatchStartedAt;
          const nextRunAfterFailure = getNextRunAt({
            cronExpression: validation.cronExpression,
            timezone: validation.normalized.timezone,
            from: new Date(now.getTime() + 1000),
          });
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to dispatch scheduled execution.";
          const recentRuns = appendRecentRuns(rawData, {
            at: now.toISOString(),
            status: "failed",
            durationMs,
            error: errorMessage,
          });
          await prisma.node.update({
            where: { id: node.id },
            data: {
              data: asJson({
                ...rawData,
                ...validation.normalized,
                active: true,
                resolvedCronExpression: validation.cronExpression,
                nextRunAt: nextRunAfterFailure?.toISOString() ?? null,
                lastError: errorMessage,
                lastResult: "failed",
                lastRunDurationMs: durationMs,
                recentRuns,
              }),
            },
          });
        });
      }
    }

    return {
      checked: scheduleNodes.length,
      triggered: triggeredCount,
    };
  },
);
