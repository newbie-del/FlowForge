"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { TerminalSquareIcon } from "lucide-react";
import { memo, useState } from "react";
import { LOGGER_NODE_CHANNEL_NAME } from "@/inngest/channels/logger-node";
import { useNodeStatus } from "../../hooks/use-node-status";
import { BaseExecutionNode } from "../base-execution-node";
import { fetchLoggerRealtimeToken } from "./actions";
import { LoggerDialog, type LoggerFormValues } from "./dialog";

type LoggerNodeData = {
  variableName?: string;
  level?: "info" | "warning" | "error" | "debug";
  message?: string;
  includeInputPayload?: boolean;
  includeTimestamp?: boolean;
};

type LoggerNodeType = Node<LoggerNodeData>;

export const LoggerNode = memo((props: NodeProps<LoggerNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: LOGGER_NODE_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchLoggerRealtimeToken,
  });

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: LoggerFormValues) => {
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

  const description = `${props.data?.level ?? "info"} · ${props.data?.message ? "Custom message" : "No message"}`;

  return (
    <>
      <LoggerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={{
          variableName: props.data?.variableName,
          level: props.data?.level,
          message: props.data?.message,
          includeInputPayload: props.data?.includeInputPayload,
          includeTimestamp: props.data?.includeTimestamp,
        }}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={TerminalSquareIcon}
        name="Logger"
        status={nodeStatus}
        description={description}
        onSetting={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

LoggerNode.displayName = "LoggerNode";
