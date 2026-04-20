"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { memo, useEffect, useState } from "react";
import { useCredentialsByType } from "@/features/credentials/hooks/use-credentials";
import { CredentialType } from "@/generated/prisma";
import { TELEGRAM_CHANNEL_NAME } from "@/inngest/channels/telegram";
import { useNodeStatus } from "../../hooks/use-node-status";
import { BaseExecutionNode } from "../base-execution-node";
import { fetchTelegramRealtimeToken } from "./actions";
import { TelegramDialog, type TelegramFormValues } from "./dialog";

type TelegramNodeData = {
  variableName?: string;
  credentialId?: string;
  chatId?: string;
  message?: string;
  parseMode?: "plain" | "markdown" | "html";
  operation?: "send_message" | "send_photo" | "send_document";
  photoUrl?: string;
  documentUrl?: string;
  photoSource?: "url" | "upload" | "previous_node";
  documentSource?: "url" | "upload" | "previous_node";
  photoFileName?: string;
  photoMimeType?: string;
  photoBase64?: string;
  photoBinaryTemplate?: string;
  documentFileName?: string;
  documentMimeType?: string;
  documentBase64?: string;
  documentBinaryTemplate?: string;
  disableNotification?: boolean;
};

type TelegramNodeType = Node<TelegramNodeData>;

export const TelegramNode = memo((props: NodeProps<TelegramNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();
  const [credentials, setCredentials] = useState<
    Array<{ id: string; name: string }>
  >([]);

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: TELEGRAM_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchTelegramRealtimeToken,
  });

  const { data: telegramCredentials } = useCredentialsByType(
    CredentialType.TELEGRAM_BOT,
  );

  useEffect(() => {
    if (telegramCredentials) {
      setCredentials(
        telegramCredentials.map((c) => ({ id: c.id, name: c.name })),
      );
    }
  }, [telegramCredentials]);

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: TelegramFormValues) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === props.id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...values,
            },
          };
        }
        return node;
      }),
    );
  };

  const nodeData = props.data;
  const operation = nodeData?.operation || "send_message";
  const description =
    operation === "send_message"
      ? nodeData?.message
        ? `Send: ${nodeData.message.slice(0, 40)}...`
        : "Not configured"
      : operation === "send_photo"
        ? `Send Photo (${nodeData?.photoSource || "url"})`
        : `Send Document (${nodeData?.documentSource || "url"})`;

  return (
    <>
      <TelegramDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
        credentials={credentials}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon="/logos/telegram.svg"
        name="Telegram"
        status={nodeStatus}
        description={description}
        onSetting={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

TelegramNode.displayName = "TelegramNode";
