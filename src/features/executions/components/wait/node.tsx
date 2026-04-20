"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { PauseCircleIcon } from "lucide-react";
import { memo, useState } from "react";
import { useNodeStatus } from "@/features/executions/hooks/use-node-status";
import { WAIT_NODE_CHANNEL_NAME } from "@/inngest/channels/wait-node";
import { BaseExecutionNode } from "../base-execution-node";
import { fetchWaitNodeRealtimeToken } from "./actions";
import { WaitNodeDialog, type WaitNodeFormValues } from "./dialog";

type WaitNodeData = {
  mode?: "seconds" | "minutes" | "hours" | "until_time" | "until_datetime";
  duration?: number;
  time?: string;
  dateTime?: string;
  timezone?: string;
  continueInTestMode?: boolean;
};

type WaitFlowNode = Node<WaitNodeData>;

const waitModeLabel: Record<NonNullable<WaitNodeData["mode"]>, string> = {
  seconds: "Seconds",
  minutes: "Minutes",
  hours: "Hours",
  until_time: "Until Time",
  until_datetime: "Until DateTime",
};

export const WaitNode = memo((props: NodeProps<WaitFlowNode>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: WAIT_NODE_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchWaitNodeRealtimeToken,
  });

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: WaitNodeFormValues) => {
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

  const mode = props.data?.mode ?? "seconds";
  const description =
    mode === "seconds" || mode === "minutes" || mode === "hours"
      ? `Wait ${props.data?.duration ?? 0} ${mode}`
      : `${waitModeLabel[mode]} (${props.data?.timezone || "UTC"})`;

  return (
    <>
      <WaitNodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={props.data}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={PauseCircleIcon}
        name="Wait"
        status={nodeStatus}
        description={description}
        onSetting={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

WaitNode.displayName = "WaitNode";
