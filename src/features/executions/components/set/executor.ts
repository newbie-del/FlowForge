import Handlebars from "handlebars";
import { decode } from "html-entities";
import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import { setNodeChannel } from "@/inngest/channels/set-node";

type SetFieldType = "text" | "number" | "boolean" | "json" | "array";

type SetNodeData = {
  fields?: Array<{
    name?: string;
    value?: string;
    type?: SetFieldType;
  }>;
  keepOnlySetFields?: boolean;
  includePreviousData?: boolean;
  useExpressions?: boolean;
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

function setValueByPath(
  target: Record<string, unknown>,
  rawPath: string,
  value: unknown,
) {
  const tokens = parsePathToken(rawPath);
  if (tokens.length === 0) {
    throw new NonRetriableError("SET node field name is invalid.");
  }
  let current: Record<string, unknown> = target;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i];
    if (!token) continue;
    const existing = current[token];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      current[token] = {};
    }
    current = current[token] as Record<string, unknown>;
  }
  const finalKey = tokens[tokens.length - 1];
  if (!finalKey) {
    throw new NonRetriableError("SET node field name is invalid.");
  }
  current[finalKey] = value;
}

function resolveRawValue(
  value: string,
  useExpressions: boolean,
  context: Record<string, unknown>,
) {
  if (!useExpressions) return value;

  const templateMatch = value.match(fullTemplatePattern);
  if (templateMatch) {
    const path = templateMatch[1]?.trim() ?? "";
    if (path && !path.startsWith("json ")) {
      return getValueByPath(context, path);
    }
  }

  return decode(Handlebars.compile(value)(context));
}

function coerceSetValue(type: SetFieldType, value: unknown) {
  if (type === "text") return String(value ?? "");
  if (type === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new NonRetriableError("SET node number field has invalid number.");
    }
    return parsed;
  }
  if (type === "boolean") {
    if (typeof value === "boolean") return value;
    const normalized = String(value ?? "").trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n", ""].includes(normalized)) return false;
    throw new NonRetriableError("SET node boolean field has invalid value.");
  }
  if (type === "json" || type === "array") {
    const parsed =
      typeof value === "string" ? JSON.parse(value) : JSON.parse(String(value));
    if (type === "array" && !Array.isArray(parsed)) {
      throw new NonRetriableError("SET node array field must resolve to an array.");
    }
    return parsed;
  }

  return value;
}

function normalizeFields(
  data: SetNodeData,
): Array<{ name: string; value: string; type: SetFieldType }> {
  const fields = Array.isArray(data.fields) ? data.fields : [];
  if (fields.length === 0) {
    throw new NonRetriableError("SET node requires at least one field.");
  }

  const seen = new Set<string>();
  return fields.map((field) => {
    const name = String(field.name ?? "").trim();
    if (!name) {
      throw new NonRetriableError("SET node field name cannot be empty.");
    }

    const normalizedName = name.toLowerCase();
    if (seen.has(normalizedName)) {
      throw new NonRetriableError(`SET node duplicate field: "${name}".`);
    }
    seen.add(normalizedName);

    const type: SetFieldType =
      field.type === "number" ||
      field.type === "boolean" ||
      field.type === "json" ||
      field.type === "array"
        ? field.type
        : "text";

    return {
      name,
      value: String(field.value ?? ""),
      type,
    };
  });
}

export const setExecutor: NodeExecutor<SetNodeData> = async ({
  data,
  nodeId,
  context,
  publish,
}) => {
  await publish(
    setNodeChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  try {
    const fields = normalizeFields(data);
    const useExpressions = data.useExpressions ?? true;
    const keepOnlySetFields = Boolean(data.keepOnlySetFields);
    const includePreviousData = data.includePreviousData ?? true;

    const nextContext =
      keepOnlySetFields || !includePreviousData
        ? {}
        : { ...context } as Record<string, unknown>;

    for (const field of fields) {
      const resolved = resolveRawValue(field.value, useExpressions, context);
      let coerced: unknown;
      try {
        coerced = coerceSetValue(field.type, resolved);
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new NonRetriableError(
            `SET node field "${field.name}" contains invalid JSON.`,
          );
        }
        throw error;
      }
      setValueByPath(nextContext, field.name, coerced);
    }

    await publish(
      setNodeChannel().status({
        nodeId,
        status: "success",
      }),
    );

    return nextContext;
  } catch (error) {
    await publish(
      setNodeChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
