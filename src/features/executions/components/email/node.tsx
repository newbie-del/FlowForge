"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { MailIcon } from "lucide-react";
import { memo, useState } from "react";
import { EMAIL_CHANNEL_NAME } from "@/inngest/channels/email";
import { useNodeStatus } from "../../hooks/use-node-status";
import { BaseExecutionNode } from "../base-execution-node";
import { fetchEmailRealtimeToken } from "./actions";
import { EmailDialog, type EmailFormValues } from "./dialog";

type EmailNodeData = {
  fromEmail?: string;
  toEmail?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  messageBody?: string;
  htmlMode?: boolean;
  attachmentsJson?: string;
  provider?: "gmail" | "outlook" | "custom";
  credentialId?: string;
  customHost?: string;
  customPort?: number;
  customSecure?: boolean;
};

type EmailNodeType = Node<EmailNodeData>;

export const EmailNode = memo((props: NodeProps<EmailNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: EMAIL_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchEmailRealtimeToken,
  });

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: EmailFormValues) => {
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
  const description = nodeData?.subject
    ? `Email: ${nodeData.subject.slice(0, 40)}...`
    : "Not configured";

  return (
    <>
      <EmailDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={MailIcon}
        name="Email"
        status={nodeStatus}
        description={description}
        onSetting={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

EmailNode.displayName = "EmailNode";
