"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { ShieldAlertIcon } from "lucide-react";
import { memo, useState } from "react";
import { ERROR_HANDLER_NODE_CHANNEL_NAME } from "@/inngest/channels/error-handler-node";
import { useNodeStatus } from "../../hooks/use-node-status";
import { BaseExecutionNode } from "../base-execution-node";
import { fetchErrorHandlerRealtimeToken } from "./actions";
import { ErrorHandlerDialog, type ErrorHandlerFormValues } from "./dialog";

type ErrorHandlerNodeData = {
  variableName?: string;
  errorPath?: string;
  retryCount?: number;
  retryDelaySeconds?: number;
  fallbackMessage?: string;
  continueWorkflow?: boolean;
};

type ErrorHandlerNodeType = Node<ErrorHandlerNodeData>;

export const ErrorHandlerNode = memo(
  (props: NodeProps<ErrorHandlerNodeType>) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const { setNodes } = useReactFlow();

    const nodeStatus = useNodeStatus({
      nodeId: props.id,
      channel: ERROR_HANDLER_NODE_CHANNEL_NAME,
      topic: "status",
      refreshToken: fetchErrorHandlerRealtimeToken,
    });

    const handleOpenSettings = () => setDialogOpen(true);

    const handleSubmit = (values: ErrorHandlerFormValues) => {
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

    const description = `${props.data?.retryCount ?? 0} retries · ${props.data?.continueWorkflow === false ? "Stop on fail" : "Continue"}`;

    return (
      <>
        <ErrorHandlerDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubmit={handleSubmit}
          defaultValues={{
            variableName: props.data?.variableName,
            errorPath: props.data?.errorPath,
            retryCount: props.data?.retryCount,
            retryDelaySeconds: props.data?.retryDelaySeconds,
            fallbackMessage: props.data?.fallbackMessage,
            continueWorkflow: props.data?.continueWorkflow,
          }}
        />
        <BaseExecutionNode
          {...props}
          id={props.id}
          icon={ShieldAlertIcon}
          name="Error Handler"
          status={nodeStatus}
          description={description}
          onSetting={handleOpenSettings}
          onDoubleClick={handleOpenSettings}
        />
      </>
    );
  },
);

ErrorHandlerNode.displayName = "ErrorHandlerNode";
