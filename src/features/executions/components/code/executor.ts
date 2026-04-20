import vm from "node:vm";
import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import { codeNodeChannel } from "@/inngest/channels/code-node";

type CodeNodeData = {
  variableName?: string;
  timeoutMs?: number;
  code?: string;
};

function assertValidResult(value: unknown) {
  if (value === undefined) {
    throw new NonRetriableError(
      "CODE node must return a value (object, array, string, number, boolean, or null).",
    );
  }

  const validType =
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "object";

  if (!validType) {
    throw new NonRetriableError("CODE node returned an invalid value type.");
  }
}

export const codeExecutor: NodeExecutor<CodeNodeData> = async ({
  data,
  nodeId,
  context,
  publish,
}) => {
  await publish(
    codeNodeChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  try {
    const variableName = String(data.variableName ?? "codeResult").trim();
    const userCode = String(data.code ?? "").trim();
    const timeoutMs = Number(data.timeoutMs ?? 3000);

    if (!variableName) {
      throw new NonRetriableError("CODE node variableName is required.");
    }
    if (!userCode) {
      throw new NonRetriableError("CODE node code is required.");
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs < 250 || timeoutMs > 10000) {
      throw new NonRetriableError(
        "CODE node timeout must be between 250 and 10000 ms.",
      );
    }

    const fallbackItems = Array.isArray(context.items) ? context.items : [];
    const sandbox = {
      input: context,
      items: fallbackItems,
      payload: context,
      console: {
        log: (..._args: unknown[]) => {},
      },
    };

    const wrapped = `(async () => {\n${userCode}\n})()`;
    let result: unknown;
    try {
      const script = new vm.Script(wrapped);
      result = await script.runInNewContext(sandbox, { timeout: timeoutMs });
    } catch (error) {
      if (error instanceof SyntaxError) {
        const lineMatch = (error.stack ?? "").match(/<anonymous>:(\d+):(\d+)/);
        const lineSuffix = lineMatch?.[1]
          ? ` (line ${Math.max(1, Number(lineMatch[1]) - 1)})`
          : "";
        throw new NonRetriableError(
          `CODE node syntax error${lineSuffix}: ${error.message}`,
        );
      }
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("script execution timed out")
      ) {
        throw new NonRetriableError("CODE node execution timed out.");
      }
      throw error;
    }

    assertValidResult(result);

    await publish(
      codeNodeChannel().status({
        nodeId,
        status: "success",
      }),
    );

    return {
      ...context,
      [variableName]: result,
    };
  } catch (error) {
    await publish(
      codeNodeChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
