import Handlebars from "handlebars";
import { decode } from "html-entities";
import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import { mergeNodeChannel } from "@/inngest/channels/merge-node";

type MergeMode =
  | "combine_objects"
  | "append_arrays"
  | "merge_by_index"
  | "merge_by_key"
  | "wait_for_both";
type ConflictStrategy = "prefer_a" | "prefer_b" | "keep_both";

type MergeNodeData = {
  mode?: MergeMode;
  keyField?: string;
  conflictStrategy?: ConflictStrategy;
  inputAPath?: string;
  inputBPath?: string;
  outputVariableName?: string;
};

const fullTemplatePattern = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  const safeString = new Handlebars.SafeString(jsonString);
  return safeString;
});

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

function resolveInput(
  path: string | undefined,
  context: Record<string, unknown>,
) {
  const value = String(path ?? "").trim();
  if (!value) return undefined;

  const templateMatch = value.match(fullTemplatePattern);
  if (templateMatch) {
    const pathValue = templateMatch[1]?.trim() ?? "";
    if (pathValue && !pathValue.startsWith("json ")) {
      return getValueByPath(context, pathValue);
    }
  }

  if (value.includes("{{")) {
    return decode(Handlebars.compile(value)(context));
  }

  return getValueByPath(context, value);
}

function mergeObjects(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  strategy: ConflictStrategy,
) {
  if (strategy === "prefer_a") {
    return { ...b, ...a };
  }
  if (strategy === "keep_both") {
    const merged: Record<string, unknown> = { ...a };
    for (const [key, value] of Object.entries(b)) {
      if (!(key in merged)) {
        merged[key] = value;
        continue;
      }
      merged[key] = {
        a: merged[key],
        b: value,
      };
    }
    return merged;
  }
  return { ...a, ...b };
}

function mergeByIndex(a: unknown[], b: unknown[], strategy: ConflictStrategy) {
  const max = Math.max(a.length, b.length);
  const rows: unknown[] = [];
  for (let i = 0; i < max; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left &&
      right &&
      typeof left === "object" &&
      typeof right === "object" &&
      !Array.isArray(left) &&
      !Array.isArray(right)
    ) {
      rows.push(
        mergeObjects(
          left as Record<string, unknown>,
          right as Record<string, unknown>,
          strategy,
        ),
      );
      continue;
    }
    if (left === undefined) rows.push(right);
    else if (right === undefined) rows.push(left);
    else rows.push(strategy === "prefer_a" ? left : right);
  }
  return rows;
}

function mergeByKey(
  a: unknown[],
  b: unknown[],
  keyField: string,
  strategy: ConflictStrategy,
) {
  const rightByKey = new Map<string, Record<string, unknown>>();
  for (const item of b) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new NonRetriableError(
        "MERGE node merge-by-key mode requires object arrays.",
      );
    }
    const keyValue = (item as Record<string, unknown>)[keyField];
    if (keyValue === null || keyValue === undefined) {
      throw new NonRetriableError(
        `MERGE node key "${keyField}" not found in input B.`,
      );
    }
    rightByKey.set(String(keyValue), item as Record<string, unknown>);
  }
  if (rightByKey.size === 0) {
    throw new NonRetriableError(
      `MERGE node key "${keyField}" not found in input B.`,
    );
  }

  const merged: Record<string, unknown>[] = [];
  for (const item of a) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const left = item as Record<string, unknown>;
    const keyValue = left[keyField];
    if (keyValue === null || keyValue === undefined) {
      throw new NonRetriableError(
        `MERGE node key "${keyField}" not found in input A.`,
      );
    }
    const right = rightByKey.get(String(keyValue));
    if (!right) {
      merged.push(left);
      continue;
    }
    merged.push(mergeObjects(left, right, strategy));
    rightByKey.delete(String(keyValue));
  }

  for (const remaining of rightByKey.values()) {
    merged.push(remaining);
  }

  return merged;
}

export const mergeExecutor: NodeExecutor<MergeNodeData> = async ({
  data,
  nodeId,
  context,
  publish,
}) => {
  await publish(
    mergeNodeChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  try {
    const mode = data.mode ?? "combine_objects";
    const strategy = data.conflictStrategy ?? "prefer_b";
    const outputVariableName = String(
      data.outputVariableName ?? "merged",
    ).trim();
    const keyField = String(data.keyField ?? "").trim();

    if (!outputVariableName) {
      throw new NonRetriableError(
        "MERGE node output variable name is required.",
      );
    }

    const inputA = resolveInput(data.inputAPath, context);
    const inputB = resolveInput(data.inputBPath, context);

    if (inputA === undefined) {
      throw new NonRetriableError("MERGE node input A is missing.");
    }
    if (inputB === undefined) {
      throw new NonRetriableError("MERGE node input B is missing.");
    }

    let result: unknown;

    if (mode === "combine_objects" || mode === "wait_for_both") {
      if (
        !inputA ||
        !inputB ||
        typeof inputA !== "object" ||
        typeof inputB !== "object" ||
        Array.isArray(inputA) ||
        Array.isArray(inputB)
      ) {
        throw new NonRetriableError(
          "MERGE node combine/wait mode requires object inputs.",
        );
      }
      result = mergeObjects(
        inputA as Record<string, unknown>,
        inputB as Record<string, unknown>,
        strategy,
      );
    } else if (mode === "append_arrays") {
      if (!Array.isArray(inputA) || !Array.isArray(inputB)) {
        throw new NonRetriableError(
          "MERGE node append mode requires array inputs.",
        );
      }
      result = [...inputA, ...inputB];
    } else if (mode === "merge_by_index") {
      if (!Array.isArray(inputA) || !Array.isArray(inputB)) {
        throw new NonRetriableError(
          "MERGE node merge-by-index mode requires array inputs.",
        );
      }
      result = mergeByIndex(inputA, inputB, strategy);
    } else {
      if (!Array.isArray(inputA) || !Array.isArray(inputB)) {
        throw new NonRetriableError(
          "MERGE node merge-by-key mode requires array inputs.",
        );
      }
      if (!keyField) {
        throw new NonRetriableError(
          "MERGE node keyField is required for merge-by-key mode.",
        );
      }
      result = mergeByKey(inputA, inputB, keyField, strategy);
    }

    await publish(
      mergeNodeChannel().status({
        nodeId,
        status: "success",
      }),
    );

    return {
      ...context,
      [outputVariableName]: result,
    };
  } catch (error) {
    await publish(
      mergeNodeChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
