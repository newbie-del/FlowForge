import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import { withNodeRoute } from "@/features/executions/lib/runtime-routing";
import type { NodeExecutor } from "@/features/executions/types";
import { loopOverItemsChannel } from "@/inngest/channels/loop-over-items";

export type LoopMode = "sequential" | "parallel" | "batch";

export type LoopOverItemsNodeData = {
  mode?: LoopMode;
  itemsPath?: string;
  batchSize?: number;
  maxItems?: number;
  delayBetweenItemsMs?: number;
  continueOnItemError?: boolean;
  itemVariableName?: string;
  outputVariableName?: string;
};

export type LoopIterationUnit = {
  index: number;
  items: unknown[];
  isBatch: boolean;
};

export type LoopPlan = {
  mode: LoopMode;
  units: LoopIterationUnit[];
  totalItems: number;
  continueOnItemError: boolean;
  delayBetweenItemsMs: number;
  itemVariableName: string;
  outputVariableName: string;
};

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  const safeString = new Handlebars.SafeString(jsonString);
  return safeString;
});

const fullTemplatePattern = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

function parsePathToken(value: string) {
  const tokens: string[] = [];
  const pattern = /([^.[\]]+)|\[(\d+)\]/g;
  for (const match of value.matchAll(pattern)) {
    if (match[1]) tokens.push(match[1]);
    else if (match[2]) tokens.push(match[2]);
  }
  return tokens;
}

function getValueByPath(source: unknown, rawPath: string): unknown {
  if (!rawPath) return undefined;
  const tokens = parsePathToken(rawPath.trim());
  let current: unknown = source;
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(token);
      current = Number.isNaN(index) ? undefined : current[index];
      continue;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[token];
      continue;
    }
    return undefined;
  }
  return current;
}

function resolveItems(
  itemsPath: string,
  context: Record<string, unknown>,
): unknown[] {
  const trimmed = itemsPath.trim();
  if (!trimmed) {
    throw new NonRetriableError("LOOP OVER ITEMS node itemsPath is required.");
  }

  const templateMatch = trimmed.match(fullTemplatePattern);
  const rawValue = templateMatch
    ? getValueByPath(context, templateMatch[1]?.trim() ?? "")
    : trimmed.includes("{{")
      ? Handlebars.compile(trimmed)(context)
      : getValueByPath(context, trimmed);

  if (!Array.isArray(rawValue)) {
    throw new NonRetriableError(
      "LOOP OVER ITEMS node input is not an array. Check itemsPath.",
    );
  }

  return rawValue;
}

function chunkItems(items: unknown[], batchSize: number) {
  const chunks: unknown[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    chunks.push(items.slice(i, i + batchSize));
  }
  return chunks;
}

export function buildLoopPlan(
  data: LoopOverItemsNodeData,
  context: Record<string, unknown>,
): LoopPlan {
  const mode: LoopMode =
    data.mode === "parallel" || data.mode === "batch"
      ? data.mode
      : "sequential";
  const batchSize = Number(data.batchSize ?? 10);
  if (mode === "batch" && (!Number.isFinite(batchSize) || batchSize <= 0)) {
    throw new NonRetriableError("LOOP OVER ITEMS batch size must be > 0.");
  }

  const delayBetweenItemsMs = Number(data.delayBetweenItemsMs ?? 0);
  if (!Number.isFinite(delayBetweenItemsMs) || delayBetweenItemsMs < 0) {
    throw new NonRetriableError("LOOP OVER ITEMS delay must be >= 0.");
  }

  const maxItemsRaw = data.maxItems;
  const maxItems =
    typeof maxItemsRaw === "number" && Number.isFinite(maxItemsRaw)
      ? Math.floor(maxItemsRaw)
      : undefined;
  if (maxItems !== undefined && maxItems <= 0) {
    throw new NonRetriableError("LOOP OVER ITEMS max items must be > 0.");
  }

  const allItemsResolved = resolveItems(String(data.itemsPath ?? ""), context);
  const allItems =
    maxItems !== undefined
      ? allItemsResolved.slice(0, maxItems)
      : allItemsResolved;
  const units =
    mode === "batch"
      ? chunkItems(allItems, Math.floor(batchSize)).map((items, index) => ({
          index,
          items,
          isBatch: true,
        }))
      : allItems.map((item, index) => ({
          index,
          items: [item],
          isBatch: false,
        }));

  return {
    mode,
    units,
    totalItems: allItems.length,
    continueOnItemError: Boolean(data.continueOnItemError),
    delayBetweenItemsMs,
    itemVariableName: String(data.itemVariableName ?? "item").trim() || "item",
    outputVariableName:
      String(data.outputVariableName ?? "loop").trim() || "loop",
  };
}

export const loopOverItemsExecutor: NodeExecutor<
  LoopOverItemsNodeData
> = async ({ data, nodeId, context, publish }) => {
  await publish(
    loopOverItemsChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  try {
    const plan = buildLoopPlan(data, context);

    await publish(
      loopOverItemsChannel().status({
        nodeId,
        status: plan.totalItems === 0 ? "success" : "loading",
        processed: 0,
        totalItems: plan.totalItems,
        failed: 0,
      }),
    );

    return withNodeRoute(
      {
        ...context,
        [plan.outputVariableName]: {
          mode: plan.mode,
          totalItems: plan.totalItems,
          totalUnits: plan.units.length,
          delayBetweenItemsMs: plan.delayBetweenItemsMs,
          continueOnItemError: plan.continueOnItemError,
          processed: 0,
          failed: 0,
        },
      },
      nodeId,
      ["__loop_internal__"],
    );
  } catch (error) {
    await publish(
      loopOverItemsChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
