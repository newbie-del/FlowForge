import { InitialNode } from "@/components/initial-node";
import { NodeType } from "@/generated/prisma";
import type { NodeTypes } from "@xyflow/react";
import { HttpRequestNode } from "@/features/executions/components/http-request/node";
import { ManualTriggerNode } from "@/features/triggers/components/manual-trigger/node";
import { LEGACY_MANUAL_TRIGGER_TYPE } from "@/lib/node-type";


export const nodeComponents = {
    [NodeType.INITIAL]: InitialNode,
    [NodeType.HTTP_REQUEST]: HttpRequestNode,
    [NodeType.MANUAL_TRIGGER] : ManualTriggerNode,
} as const satisfies NodeTypes;

console.log("[flowforge][nodeComponents]", Object.keys(nodeComponents));

export type RegisteredNodeType = keyof typeof nodeComponents;
