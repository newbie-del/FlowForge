"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { Code2Icon } from "lucide-react";
import { memo, useState } from "react";
import { CODE_NODE_CHANNEL_NAME } from "@/inngest/channels/code-node";
import { useNodeStatus } from "../../hooks/use-node-status";
import { BaseExecutionNode } from "../base-execution-node";
import { fetchCodeNodeRealtimeToken } from "./actions";
import { CodeNodeDialog, type CodeNodeFormValues } from "./dialog";

type CodeNodeData = {
  variableName?: string;
  timeoutMs?: number;
  template?:
    | "filter_items"
    | "map_fields"
    | "map_items"
    | "rename_fields"
    | "score_jobs"
    | "transform_payload";
  code?: string;
};

type CodeNodeType = Node<CodeNodeData>;

export const CodeNode = memo((props: NodeProps<CodeNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: CODE_NODE_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchCodeNodeRealtimeToken,
  });

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: CodeNodeFormValues) => {
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

  const description = props.data?.code
    ? `JS · ${props.data.variableName || "codeResult"}`
    : "Not configured";

  return (
    <>
      <CodeNodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={{
          variableName: props.data?.variableName,
          timeoutMs: props.data?.timeoutMs,
          template: props.data?.template,
          code: props.data?.code,
        }}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={Code2Icon}
        name="Code"
        status={nodeStatus}
        description={description}
        onSetting={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

CodeNode.displayName = "CodeNode";
