import type { Edge, Node } from "@xyflow/react";
import { generateSlug } from "random-word-slugs";
import z from "zod";
import { PAGINATION } from "@/config/constants";
import { NodeType } from "@/generated/prisma";
import { inngest } from "@/inngest/client";
import { sendWorkflowExecution } from "@/inngest/utils";
import prisma from "@/lib/db";
import {
  createTRPCRouter,
  premiumProcedure,
  protectedProcedure,
} from "@/trpc/init";
import type { AiWorkflowPlan } from "../lib/ai-workflow-schema";
import { aiWorkflowBuilderInputSchema } from "../lib/ai-workflow-schema";
import { generateAiWorkflowPlan } from "./ai-builder";
import { generateSupportChatResponse } from "./support-chat";

export const workflowsRouter = createTRPCRouter({
  execute: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: {
          id: input.id,
          userId: ctx.auth.user.id,
        },
      });

      await inngest.send({
        name: "workflows/execute.workflow",
        data: { workflowId: input.id },
      });

      await sendWorkflowExecution({
        workflowId: input.id,
      });

      return workflow;
    }),
  generateWithAi: premiumProcedure
    .input(aiWorkflowBuilderInputSchema)
    .mutation(async ({ ctx, input }) => {
      await prisma.workflow.findUniqueOrThrow({
        where: {
          id: input.workflowId,
          userId: ctx.auth.user.id,
        },
        select: { id: true },
      });

      return generateAiWorkflowPlan({
        userId: ctx.auth.user.id,
        prompt: input.prompt,
        mode: input.mode,
        history: input.history,
        currentNodes: input.currentNodes,
        currentEdges: input.currentEdges,
      });
    }),
  create: premiumProcedure.mutation(({ ctx }) => {
    return prisma.workflow.create({
      data: {
        name: generateSlug(3),
        userId: ctx.auth.user.id,
        nodes: {
          create: {
            type: NodeType.INITIAL,
            position: { x: 0, y: 0 },
            name: NodeType.INITIAL,
          },
        },
      },
    });
  }),
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return prisma.workflow.delete({
        where: {
          id: input.id,
          userId: ctx.auth.user.id,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        nodes: z.array(
          z.object({
            id: z.string(),
            type: z.string().nullish(),
            position: z.object({ x: z.number(), y: z.number() }),
            data: z.record(z.string(), z.any()).optional(),
          }),
        ),
        edges: z.array(
          z.object({
            source: z.string(),
            target: z.string(),
            sourceHandle: z.string().nullish(),
            targetHandle: z.string().nullish(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, nodes, edges } = input;

      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: { id, userId: ctx.auth.user.id },
      });

      // Transaction to ensure consistency
      return await prisma.$transaction(async (tx) => {
        const usedNodeIds = new Set<string>();
        const firstNodeIdMapping = new Map<string, string>();

        const normalizedNodes = nodes.map((node, index) => {
          const originalId = String(node.id || `node_${index + 1}`);
          const scopedId = originalId.startsWith(`${id}__`)
            ? originalId
            : `${id}__${originalId}`;
          let nextId = scopedId;
          let suffix = 1;

          while (usedNodeIds.has(nextId)) {
            nextId = `${scopedId}_${suffix++}`;
          }

          usedNodeIds.add(nextId);
          if (!firstNodeIdMapping.has(originalId)) {
            firstNodeIdMapping.set(originalId, nextId);
          }

          return {
            ...node,
            id: nextId,
          };
        });

        const seenConnections = new Set<string>();
        const normalizedEdges = edges
          .map((edge) => ({
            ...edge,
            source: firstNodeIdMapping.get(edge.source) ?? edge.source,
            target: firstNodeIdMapping.get(edge.target) ?? edge.target,
          }))
          .filter(
            (edge) =>
              usedNodeIds.has(edge.source) && usedNodeIds.has(edge.target),
          )
          .filter((edge) => {
            const key = `${edge.source}|${edge.target}|${edge.sourceHandle || "main"}|${edge.targetHandle || "main"}`;
            if (seenConnections.has(key)) {
              return false;
            }
            seenConnections.add(key);
            return true;
          });

        //Delete existing connections first (foreign key constraint)
        await tx.connection.deleteMany({
          where: { workflowId: id },
        });

        //Delete existing nodes
        await tx.node.deleteMany({
          where: { workflowId: id },
        });

        //Create nodes
        if (normalizedNodes.length > 0) {
          await tx.node.createMany({
            data: normalizedNodes.map((node) => ({
              id: node.id,
              workflowId: id,
              name: node.type || "unknown",
              type: node.type as NodeType,
              position: node.position,
              data: node.data || {},
            })),
          });
        }

        //Create connections
        if (normalizedEdges.length > 0) {
          await tx.connection.createMany({
            data: normalizedEdges.map((edge) => ({
              workflowId: id,
              fromNodeId: edge.source,
              toNodeId: edge.target,
              fromOutput: edge.sourceHandle || "main",
              toInput: edge.targetHandle || "main",
            })),
          });
        }

        //update workflow's updatedAt timestamp
        await tx.workflow.update({
          where: { id },
          data: { updatedAt: new Date() },
        });

        return workflow;
      });
    }),
  updateName: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return prisma.workflow.update({
        where: { id: input.id, userId: ctx.auth.user.id },
        data: { name: input.name },
      });
    }),
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: { id: input.id, userId: ctx.auth.user.id },
        include: { nodes: true, connections: true },
      });

      //Transform server nodes to react-flow compatible nodes
      const nodes: Node[] = workflow.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position as { x: number; y: number },
        data: (node.data as Record<string, unknown>) || {},
      }));

      //Transform server connections  to react-flow compatible edges
      const edges: Edge[] = workflow.connections.map((connection) => ({
        id: connection.id,
        source: connection.fromNodeId,
        target: connection.toNodeId,
        sourceHandle: connection.fromOutput,
        targetHandle: connection.toInput,
      }));

      return {
        id: workflow.id,
        name: workflow.name,
        nodes,
        edges,
        aiBuilderMetadata: workflow.aiBuilderMetadata
          ? (workflow.aiBuilderMetadata as AiWorkflowPlan | null)
          : null,
      };
    }),
  getMany: protectedProcedure
    .input(
      z.object({
        page: z.number().default(PAGINATION.DEFAULT_PAGE),
        pageSize: z
          .number()
          .min(PAGINATION.MIN_PAGE_SIZE)
          .max(PAGINATION.MAX_PAGE_SIZE)
          .default(PAGINATION.DEFAULT_PAGE_SIZE),
        search: z.string().default(""),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, search } = input;

      const [items, totalCount] = await Promise.all([
        prisma.workflow.findMany({
          skip: (page - 1) * pageSize,
          take: pageSize,
          where: {
            userId: ctx.auth.user.id,
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
        }),
        prisma.workflow.count({
          where: {
            userId: ctx.auth.user.id,
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
        }),
      ]);

      const totalPages = Math.ceil(totalCount / pageSize);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        items,
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      };
    }),
  supportChat: protectedProcedure
    .input(
      z.object({
        workflowPlan: z.any(), // AiWorkflowPlan
        userMessage: z.string().min(1),
        conversationHistory: z.array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string(),
          }),
        ),
        preferredProvider: z.enum(["openai", "gemini", "anthropic"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return generateSupportChatResponse({
        userId: ctx.auth.user.id,
        workflowPlan: input.workflowPlan as AiWorkflowPlan,
        userMessage: input.userMessage,
        conversationHistory: input.conversationHistory,
        preferredProvider: input.preferredProvider,
      });
    }),
  saveAiBuilderState: protectedProcedure
    .input(
      z.object({
        workflowId: z.string(),
        aiMetadata: z.object({
          generated: z.boolean(),
          prompt: z.string(),
          provider: z.enum(["openai", "gemini", "anthropic"]),
          mode: z.enum([
            "generate",
            "regenerate",
            "improve",
            "optimize",
            "fix",
            "convert_manual",
          ]),
          messages: z.array(z.any()),
          plan: z.any().nullable(),
          summary: z.string().optional(),
          nextSteps: z.array(z.string()).optional(),
          requiredCredentials: z.array(z.any()).optional(),
          missingInputs: z.array(z.any()).optional(),
          unsupportedRequests: z.array(z.string()).optional(),
          plannerNotes: z.array(z.string()).optional(),
          hasManualEdits: z.boolean().optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString();

      const _workflow = await prisma.workflow.findUniqueOrThrow({
        where: { id: input.workflowId, userId: ctx.auth.user.id },
      });

      return prisma.workflow.update({
        where: { id: input.workflowId },
        data: {
          aiBuilderMetadata: {
            ...input.aiMetadata,
            autoGeneratedAt: now,
            lastUpdatedAt: now,
            version: 1,
          },
        },
      });
    }),
});
