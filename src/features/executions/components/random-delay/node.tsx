"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { Clock3Icon } from "lucide-react";
import { memo, useState } from "react";
import { RANDOM_DELAY_NODE_CHANNEL_NAME } from "@/inngest/channels/random-delay-node";
import { useNodeStatus } from "../../hooks/use-node-status";
import { BaseExecutionNode } from "../base-execution-node";
import { fetchRandomDelayRealtimeToken } from "./actions";
import { RandomDelayDialog, type RandomDelayFormValues } from "./dialog";

type RandomDelayNodeData = {
  variableName?: string;
  minDelay?: number;
  maxDelay?: number;
  mode?: "seconds" | "minutes";
  showGeneratedDelay?: boolean;
};

type RandomDelayNodeType = Node<RandomDelayNodeData>;

export const RandomDelayNode = memo((props: NodeProps<RandomDelayNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: RANDOM_DELAY_NODE_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchRandomDelayRealtimeToken,
  });

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: RandomDelayFormValues) => {
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

  const description = `${props.data?.minDelay ?? 1}-${props.data?.maxDelay ?? 5} ${props.data?.mode ?? "seconds"}`;

  return (
    <>
      <RandomDelayDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={{
          variableName: props.data?.variableName,
          minDelay: props.data?.minDelay,
          maxDelay: props.data?.maxDelay,
          mode: props.data?.mode,
          showGeneratedDelay: props.data?.showGeneratedDelay,
        }}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={Clock3Icon}
        name="Random Delay"
        status={nodeStatus}
        description={description}
        onSetting={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

RandomDelayNode.displayName = "RandomDelayNode";
