"use client";

import { useInngestSubscription } from "@inngest/realtime/hooks";
import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { RepeatIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { LOOP_OVER_ITEMS_CHANNEL_NAME } from "@/inngest/channels/loop-over-items";
import { useNodeStatus } from "../../hooks/use-node-status";
import { BaseExecutionNode } from "../base-execution-node";
import { fetchLoopOverItemsRealtimeToken } from "./actions";
import { LoopOverItemsDialog, type LoopOverItemsFormValues } from "./dialog";

type LoopNodeData = {
  mode?: "sequential" | "parallel" | "batch";
  itemsPath?: string;
  batchSize?: number;
  maxItems?: number;
  delayBetweenItemsMs?: number;
  continueOnItemError?: boolean;
  itemVariableName?: string;
  outputVariableName?: string;
};

type LoopNodeType = Node<LoopNodeData>;

export const LoopOverItemsNode = memo((props: NodeProps<LoopNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: LOOP_OVER_ITEMS_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchLoopOverItemsRealtimeToken,
  });
  const { data } = useInngestSubscription({
    refreshToken: fetchLoopOverItemsRealtimeToken,
    enabled: true,
  });

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: LoopOverItemsFormValues) => {
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
    props.data?.mode === "parallel"
      ? "Parallel"
      : props.data?.mode === "batch"
        ? `Batch (${props.data.batchSize ?? 10})`
        : "Sequential";
  const description = props.data?.itemsPath
    ? `${modeLabel} · ${props.data.itemsPath}`
    : "Not configured";
  const progressLabel = useMemo(() => {
    const lastMessage = data
      ?.filter(
        (message) =>
          message.kind === "data" &&
          message.channel === LOOP_OVER_ITEMS_CHANNEL_NAME &&
          message.topic === "status" &&
          message.data.nodeId === props.id,
      )
      .sort((a, b) => {
        if (a.kind !== "data" || b.kind !== "data") return 0;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      })[0];

    if (!lastMessage || lastMessage.kind !== "data") return null;
    const processed = Number(lastMessage.data.processed ?? 0);
    const total = Number(lastMessage.data.totalItems ?? 0);
    const failed = Number(lastMessage.data.failed ?? 0);
    if (!Number.isFinite(total) || total <= 0) return null;
    return `${Math.max(0, processed)}/${total} processed${failed > 0 ? ` · ${failed} failed` : ""}`;
  }, [data, props.id]);

  return (
    <>
      <LoopOverItemsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={{
          mode: props.data?.mode,
          itemsPath: props.data?.itemsPath,
          batchSize: props.data?.batchSize,
          maxItems: props.data?.maxItems,
          delayBetweenItemsMs: props.data?.delayBetweenItemsMs,
          continueOnItemError: props.data?.continueOnItemError,
          itemVariableName: props.data?.itemVariableName,
          outputVariableName: props.data?.outputVariableName,
        }}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={RepeatIcon}
        name="Loop Over Items"
        status={nodeStatus}
        description={
          progressLabel ? `${description} · ${progressLabel}` : description
        }
        onSetting={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

LoopOverItemsNode.displayName = "LoopOverItemsNode";
