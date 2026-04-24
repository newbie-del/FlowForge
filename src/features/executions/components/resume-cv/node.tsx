"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { FileTextIcon } from "lucide-react";
import { memo, useState } from "react";
import { RESUME_CV_NODE_CHANNEL_NAME } from "@/inngest/channels/resume-cv-node";
import { useNodeStatus } from "../../hooks/use-node-status";
import { BaseExecutionNode } from "../base-execution-node";
import { fetchResumeCvRealtimeToken } from "./actions";
import { ResumeCvDialog, type ResumeCvFormValues } from "./dialog";

type ResumeCvNodeData = {
  operation?:
    | "upload_resume"
    | "select_resume"
    | "auto_choose_by_role"
    | "output_file"
    | "analyze_resume";
  variableName?: string;
  selectedResumeKey?: "frontend" | "backend" | "general";
  jobTitlePath?: string;
  resumes?: Array<{
    key?: "frontend" | "backend" | "general";
    label?: string;
    fileName?: string;
    mimeType?: string;
    base64?: string;
  }>;
};

type ResumeCvNodeType = Node<ResumeCvNodeData>;

export const ResumeCvNode = memo((props: NodeProps<ResumeCvNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: RESUME_CV_NODE_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchResumeCvRealtimeToken,
  });

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: ResumeCvFormValues) => {
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
    props.data?.operation === "auto_choose_by_role"
      ? "Auto choose"
      : props.data?.operation === "analyze_resume"
        ? "Analyze"
        : props.data?.operation === "upload_resume"
          ? "Upload"
          : "Select";

  const description = `${modeLabel} · ${props.data?.selectedResumeKey ?? "general"}`;

  return (
    <>
      <ResumeCvDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={{
          operation: props.data?.operation,
          variableName: props.data?.variableName,
          selectedResumeKey: props.data?.selectedResumeKey,
          jobTitlePath: props.data?.jobTitlePath,
          resumes: Array.isArray(props.data?.resumes)
            ? props.data.resumes
                .filter(
                  (
                    resume,
                  ): resume is {
                    key: "frontend" | "backend" | "general";
                    label?: string;
                    fileName?: string;
                    mimeType?: string;
                    base64?: string;
                  } =>
                    resume.key === "frontend" ||
                    resume.key === "backend" ||
                    resume.key === "general",
                )
                .map((resume) => ({
                  key: resume.key,
                  label: String(resume.label ?? ""),
                  fileName: String(resume.fileName ?? ""),
                  mimeType: String(resume.mimeType ?? ""),
                  base64: String(resume.base64 ?? ""),
                }))
            : [],
        }}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={FileTextIcon}
        name="Resume / CV"
        status={nodeStatus}
        description={description}
        onSetting={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

ResumeCvNode.displayName = "ResumeCvNode";
