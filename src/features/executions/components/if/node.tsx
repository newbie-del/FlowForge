"use client";

import {
  type Node,
  type NodeProps,
  Position,
  useReactFlow,
} from "@xyflow/react";
import { GitBranchIcon } from "lucide-react";
import { memo, useState } from "react";
import { BaseHandle } from "@/components/react-flow/base-handle";
import { BaseNode, BaseNodeContent } from "@/components/react-flow/base-node";
import { NodeStatusIndicator } from "@/components/react-flow/node-status-indicator";
import { WorkflowNode } from "@/components/workflow-node";
import { useNodeStatus } from "@/features/executions/hooks/use-node-status";
import { IF_NODE_CHANNEL_NAME } from "@/inngest/channels/if-node";
import { fetchIfNodeRealtimeToken } from "./actions";
import { IfNodeDialog, type IfNodeFormValues } from "./dialog";
import { ifOperators } from "./executor";

type IfNodeData = {
  combineOperation?: "all" | "any";
  caseSensitive?: boolean;
  conditions?: Array<{
    leftValue?: string;
    operator?: string;
    rightValue?: string;
  }>;
  leftValue?: string;
  operator?: string;
  rightValue?: string;
};

type IfFlowNode = Node<IfNodeData>;

export const IfNode = memo((props: NodeProps<IfFlowNode>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes, setEdges } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: IF_NODE_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchIfNodeRealtimeToken,
  });

  const handleDelete = () => {
    setNodes((currentNodes) =>
      currentNodes.filter((node) => node.id !== props.id),
    );
    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) => edge.source !== props.id && edge.target !== props.id,
      ),
    );
  };

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: IfNodeFormValues) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== props.id) return node;
        return {
          ...node,
          data: {
            ...node.data,
            ...values,
            leftValue: values.conditions[0]?.leftValue ?? "",
            operator: values.conditions[0]?.operator ?? "equals",
            rightValue: values.conditions[0]?.rightValue ?? "",
          },
        };
      }),
    );
  };

  const conditionCount = Array.isArray(props.data?.conditions)
    ? props.data.conditions.length
    : 1;
  const mode = props.data?.combineOperation === "any" ? "ANY" : "ALL";
  const description = `${mode} · ${conditionCount} condition${conditionCount > 1 ? "s" : ""}`;

  return (
    <>
      <IfNodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={{
          combineOperation:
            props.data?.combineOperation === "any" ? "any" : "all",
          caseSensitive: Boolean(props.data?.caseSensitive),
          conditions: Array.isArray(props.data?.conditions)
            ? props.data.conditions
                .map((condition) => {
                  if (
                    typeof condition.leftValue !== "string" ||
                    typeof condition.operator !== "string"
                  ) {
                    return null;
                  }
                  return {
                    leftValue: condition.leftValue,
                    operator:
                      condition.operator as IfNodeFormValues["conditions"][number]["operator"],
                    rightValue:
                      typeof condition.rightValue === "string"
                        ? condition.rightValue
                        : "",
                  };
                })
                .filter(
                  (condition): condition is NonNullable<typeof condition> =>
                    Boolean(condition),
                )
            : undefined,
          leftValue:
            typeof props.data?.leftValue === "string"
              ? props.data.leftValue
              : "",
          operator:
            typeof props.data?.operator === "string" &&
            ifOperators.includes(
              props.data.operator as (typeof ifOperators)[number],
            )
              ? (props.data.operator as (typeof ifOperators)[number])
              : undefined,
          rightValue:
            typeof props.data?.rightValue === "string"
              ? props.data.rightValue
              : "",
        }}
      />

      <WorkflowNode
        name="IF"
        description={description}
        onDelete={handleDelete}
        onSettings={handleOpenSettings}
      >
        <NodeStatusIndicator status={nodeStatus} variant="border">
          <BaseNode
            status={nodeStatus}
            onDoubleClick={handleOpenSettings}
            className="relative"
          >
            <BaseNodeContent className="items-center justify-center">
              <GitBranchIcon className="size-4 text-muted-foreground" />
            </BaseNodeContent>

            <BaseHandle id="target-1" type="target" position={Position.Left} />

            <BaseHandle
              id="if-true"
              type="source"
              position={Position.Right}
              style={{ top: "38%" }}
            />
            <BaseHandle
              id="if-false"
              type="source"
              position={Position.Right}
              style={{ top: "66%" }}
            />

            <span className="absolute right-1 top-[30%] text-[8px] font-semibold leading-none text-green-600 select-none">
              T
            </span>
            <span className="absolute right-1 top-[58%] text-[8px] font-semibold leading-none text-rose-600 select-none">
              F
            </span>
          </BaseNode>
        </NodeStatusIndicator>
      </WorkflowNode>
    </>
  );
});

IfNode.displayName = "IfNode";
