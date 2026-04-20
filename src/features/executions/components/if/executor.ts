import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import { withNodeRoute } from "@/features/executions/lib/runtime-routing";
import type { NodeExecutor } from "@/features/executions/types";
import { ifNodeChannel } from "@/inngest/channels/if-node";

export const ifOperators = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "greater_than",
  "less_than",
  "greater_or_equal",
  "less_or_equal",
  "is_empty",
  "is_not_empty",
  "exists",
  "not_exists",
] as const;

export type IfOperator = (typeof ifOperators)[number];

export type IfCondition = {
  leftValue?: string;
  operator?: IfOperator;
  rightValue?: string;
};

type IfNodeData = {
  conditions?: IfCondition[];
  combineOperation?: "all" | "any";
  caseSensitive?: boolean;
  leftValue?: string;
  operator?: IfOperator;
  rightValue?: string;
};

const fullTemplatePattern = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

function parsePathToken(value: string) {
  const tokens: string[] = [];
  const pattern = /([^.[\]]+)|\[(\d+)\]/g;
  for (const match of value.matchAll(pattern)) {
    if (match[1]) {
      tokens.push(match[1]);
    } else if (match[2]) {
      tokens.push(match[2]);
    }
  }
  return tokens;
}

function getValueByPath(source: unknown, rawPath: string): unknown {
  if (!rawPath) {
    return undefined;
  }

  const cleaned = rawPath.trim();
  const tokens = parsePathToken(cleaned);
  let current: unknown = source;

  for (const token of tokens) {
    if (current === null || current === undefined) {
      return undefined;
    }

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

function resolveExpression(
  expression: string | undefined,
  context: Record<string, unknown>,
) {
  const value = String(expression ?? "");
  const templateMatch = value.match(fullTemplatePattern);
  if (!templateMatch) {
    return value;
  }

  const path = templateMatch[1]?.trim() ?? "";
  if (!path || path.startsWith("json ")) {
    return Handlebars.compile(value)(context);
  }

  return getValueByPath(context, path);
}

function toComparableString(value: unknown, caseSensitive: boolean) {
  const normalized = String(value ?? "");
  return caseSensitive ? normalized : normalized.toLowerCase();
}

function toNumberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function isEmptyValue(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function evaluateCondition(
  condition: Required<Pick<IfCondition, "leftValue" | "operator">> &
    Pick<IfCondition, "rightValue">,
  context: Record<string, unknown>,
  caseSensitive: boolean,
) {
  const left = resolveExpression(condition.leftValue, context);
  const right = resolveExpression(condition.rightValue, context);
  const operator = condition.operator;

  switch (operator) {
    case "equals":
      return (
        toComparableString(left, caseSensitive) ===
        toComparableString(right, caseSensitive)
      );
    case "not_equals":
      return (
        toComparableString(left, caseSensitive) !==
        toComparableString(right, caseSensitive)
      );
    case "contains":
      return toComparableString(left, caseSensitive).includes(
        toComparableString(right, caseSensitive),
      );
    case "not_contains":
      return !toComparableString(left, caseSensitive).includes(
        toComparableString(right, caseSensitive),
      );
    case "starts_with":
      return toComparableString(left, caseSensitive).startsWith(
        toComparableString(right, caseSensitive),
      );
    case "ends_with":
      return toComparableString(left, caseSensitive).endsWith(
        toComparableString(right, caseSensitive),
      );
    case "greater_than":
    case "less_than":
    case "greater_or_equal":
    case "less_or_equal": {
      const leftNumber = toNumberOrNull(left);
      const rightNumber = toNumberOrNull(right);
      if (leftNumber === null || rightNumber === null) {
        throw new NonRetriableError(
          `IF node numeric comparison "${operator}" requires numeric left/right values.`,
        );
      }
      if (operator === "greater_than") return leftNumber > rightNumber;
      if (operator === "less_than") return leftNumber < rightNumber;
      if (operator === "greater_or_equal") return leftNumber >= rightNumber;
      return leftNumber <= rightNumber;
    }
    case "is_empty":
      return isEmptyValue(left);
    case "is_not_empty":
      return !isEmptyValue(left);
    case "exists":
      return left !== undefined && left !== null;
    case "not_exists":
      return left === undefined || left === null;
    default:
      throw new NonRetriableError(`Unsupported IF operator: ${operator}`);
  }
}

function normalizeConditions(data: IfNodeData): IfCondition[] {
  const conditions = Array.isArray(data.conditions)
    ? data.conditions
    : [
        {
          leftValue: data.leftValue,
          operator: data.operator,
          rightValue: data.rightValue,
        },
      ];

  const validConditions = conditions.filter(
    (condition) =>
      typeof condition.leftValue === "string" &&
      condition.leftValue.trim() &&
      typeof condition.operator === "string",
  );

  if (validConditions.length === 0) {
    throw new NonRetriableError(
      "IF node must include at least one valid condition.",
    );
  }

  return validConditions;
}

export const ifNodeExecutor: NodeExecutor<IfNodeData> = async ({
  data,
  nodeId,
  context,
  step,
  publish,
}) => {
  await publish(
    ifNodeChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  try {
    const combineOperation = data.combineOperation === "any" ? "any" : "all";
    const caseSensitive = Boolean(data.caseSensitive ?? false);
    const conditions = normalizeConditions(data);

    const result = await step.run(`if-condition-${nodeId}`, async () => {
      const evaluations = conditions.map((condition) =>
        evaluateCondition(
          {
            leftValue: String(condition.leftValue ?? "").trim(),
            operator: condition.operator as IfOperator,
            rightValue:
              typeof condition.rightValue === "string"
                ? condition.rightValue
                : "",
          },
          context,
          caseSensitive,
        ),
      );

      return combineOperation === "any"
        ? evaluations.some(Boolean)
        : evaluations.every(Boolean);
    });

    await publish(
      ifNodeChannel().status({
        nodeId,
        status: "success",
      }),
    );

    return withNodeRoute(
      context,
      nodeId,
      result ? ["if-true", "source-1"] : ["if-false"],
    );
  } catch (error) {
    await publish(
      ifNodeChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
