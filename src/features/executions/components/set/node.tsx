"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { PencilLineIcon } from "lucide-react";
import { memo, useState } from "react";
import { useNodeStatus } from "../../hooks/use-node-status";
import { BaseExecutionNode } from "../base-execution-node";
import { fetchSetNodeRealtimeToken } from "./actions";
import { SetNodeDialog, type SetNodeFormValues } from "./dialog";
import { SET_NODE_CHANNEL_NAME } from "@/inngest/channels/set-node";

type SetNodeData = {
  fields?: Array<{
    name?: string;
    value?: string;
    type?: "text" | "number" | "boolean" | "json" | "array";
  }>;
  keepOnlySetFields?: boolean;
  includePreviousData?: boolean;
  useExpressions?: boolean;
};

type SetNodeType = Node<SetNodeData>;

export const SetNode = memo((props: NodeProps<SetNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: SET_NODE_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchSetNodeRealtimeToken,
  });

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: SetNodeFormValues) => {
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

  const fieldCount = Array.isArray(props.data?.fields) ? props.data.fields.length : 0;
  const description = fieldCount > 0 ? `${fieldCount} field${fieldCount > 1 ? "s" : ""}` : "Not configured";

  return (
    <>
      <SetNodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={{
          fields: Array.isArray(props.data?.fields)
            ? props.data.fields.map((field) => ({
                name: String(field.name ?? ""),
                value: String(field.value ?? ""),
                type:
                  field.type === "number" ||
                  field.type === "boolean" ||
                  field.type === "json" ||
                  field.type === "array"
                    ? field.type
                    : "text",
              }))
            : undefined,
          keepOnlySetFields: Boolean(props.data?.keepOnlySetFields),
          includePreviousData: props.data?.includePreviousData ?? true,
          useExpressions: props.data?.useExpressions ?? true,
        }}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={PencilLineIcon}
        name="Set"
        status={nodeStatus}
        description={description}
        onSetting={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

SetNode.displayName = "SetNode";
