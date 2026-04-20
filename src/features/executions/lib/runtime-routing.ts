import type { WorkflowContext } from "../types";

const FLOWFORGE_RUNTIME_KEY = "__flowforgeRuntime";

type RuntimeState = {
  source?: string;
  routeByNodeId?: Record<string, string[]>;
};

function getRuntimeState(context: WorkflowContext): RuntimeState {
  const runtimeRaw = context[FLOWFORGE_RUNTIME_KEY];
  if (!runtimeRaw || typeof runtimeRaw !== "object") {
    return {};
  }

  return runtimeRaw as RuntimeState;
}

export function withExecutionSource(
  context: WorkflowContext,
  source: string,
): WorkflowContext {
  const runtime = getRuntimeState(context);

  return {
    ...context,
    [FLOWFORGE_RUNTIME_KEY]: {
      ...runtime,
      source,
    },
  };
}

export function getExecutionSource(context: WorkflowContext): string {
  const runtime = getRuntimeState(context);
  return runtime.source || "manual";
}

export function withNodeRoute(
  context: WorkflowContext,
  nodeId: string,
  outputs: string[],
): WorkflowContext {
  const runtime = getRuntimeState(context);
  const currentRoutes = runtime.routeByNodeId ?? {};

  return {
    ...context,
    [FLOWFORGE_RUNTIME_KEY]: {
      ...runtime,
      routeByNodeId: {
        ...currentRoutes,
        [nodeId]: outputs,
      },
    },
  };
}

export function getNodeRoute(
  context: WorkflowContext,
  nodeId: string,
): string[] | null {
  const runtime = getRuntimeState(context);
  const route = runtime.routeByNodeId?.[nodeId];
  return Array.isArray(route) ? route : null;
}

export function stripRuntimeState(context: WorkflowContext): WorkflowContext {
  const { [FLOWFORGE_RUNTIME_KEY]: _internalRuntime, ...rest } = context;
  return rest;
}
