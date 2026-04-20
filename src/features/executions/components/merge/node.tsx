"use client";

import { type Node, type NodeProps, Position, useReactFlow } from "@xyflow/react";
import { MergeIcon } from "lucide-react";
import { memo, useState } from "react";
import { BaseHandle } from "@/components/react-flow/base-handle";
import { BaseNode, BaseNodeContent } from "@/components/react-flow/base-node";
import { NodeStatusIndicator } from "@/components/react-flow/node-status-indicator";
import { WorkflowNode } from "@/components/workflow-node";
import { MERGE_NODE_CHANNEL_NAME } from "@/inngest/channels/merge-node";
import { useNodeStatus } from "../../hooks/use-node-status";
import { fetchMergeNodeRealtimeToken } from "./actions";
import { MergeNodeDialog, type MergeNodeFormValues } from "./dialog";

type MergeNodeData = {
  mode?: "combine_objects" | "append_arrays" | "merge_by_index" | "merge_by_key" | "wait_for_both";
  keyField?: string;
  conflictStrategy?: "prefer_a" | "prefer_b" | "keep_both";
  inputAPath?: string;
  inputBPath?: string;
  outputVariableName?: string;
};

type MergeFlowNode = Node<MergeNodeData>;

export const MergeNode = memo((props: NodeProps<MergeFlowNode>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes, setEdges } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: MERGE_NODE_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchMergeNodeRealtimeToken,
  });

  const handleDelete = () => {
    setNodes((nodes) => nodes.filter((node) => node.id !== props.id));
    setEdges((edges) => edges.filter((edge) => edge.source !== props.id && edge.target !== props.id));
  };

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: MergeNodeFormValues) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === props.id
          ? {
              ...node,
              data: {
                ...node.data,
                ...values,
              },
            }
          : node,
      ),
    );
  };

  const modeLabel =
    props.data?.mode === "append_arrays"
      ? "Append Arrays"
      : props.data?.mode === "merge_by_index"
        ? "Merge by Index"
        : props.data?.mode === "merge_by_key"
          ? "Merge by Key"
          : props.data?.mode === "wait_for_both"
            ? "Wait for Both Inputs"
            : "Combine Objects";

  return (
    <>
      <MergeNodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={{
          mode: props.data?.mode,
          keyField: props.data?.keyField,
          conflictStrategy: props.data?.conflictStrategy,
          inputAPath: props.data?.inputAPath,
          inputBPath: props.data?.inputBPath,
          outputVariableName: props.data?.outputVariableName,
        }}
      />

      <WorkflowNode name="Merge" description={modeLabel} onDelete={handleDelete} onSettings={handleOpenSettings}>
        <NodeStatusIndicator status={nodeStatus} variant="border">
          <BaseNode status={nodeStatus} onDoubleClick={handleOpenSettings} className="relative">
            <BaseNodeContent className="items-center justify-center">
              <MergeIcon className="size-4 text-muted-foreground" />
            </BaseNodeContent>
            <BaseHandle id="target-a" type="target" position={Position.Left} style={{ top: "35%" }} />
            <BaseHandle id="target-b" type="target" position={Position.Left} style={{ top: "65%" }} />
            <BaseHandle id="source-1" type="source" position={Position.Right} />
            <span className="absolute left-1 top-[27%] text-[8px] font-semibold leading-none select-none text-muted-foreground">
              A
            </span>
            <span className="absolute left-1 top-[57%] text-[8px] font-semibold leading-none select-none text-muted-foreground">
              B
            </span>
          </BaseNode>
        </NodeStatusIndicator>
      </WorkflowNode>
    </>
  );
});

MergeNode.displayName = "MergeNode";
