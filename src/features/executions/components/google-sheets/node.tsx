"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { memo, useState } from "react";
import { GOOGLE_SHEETS_CHANNEL_NAME } from "@/inngest/channels/google-sheets";
import { useNodeStatus } from "../../hooks/use-node-status";
import { BaseExecutionNode } from "../base-execution-node";
import { fetchGoogleSheetsRealtimeToken } from "./actions";
import { GoogleSheetsDialog, type GoogleSheetsFormValues } from "./dialog";

type GoogleSheetsNodeData = {
  credentialId?: string;
  spreadsheetId?: string;
  sheetName?: string;
  operation?:
    | "read_rows"
    | "append_row"
    | "update_row"
    | "find_row"
    | "delete_row"
    | "create_sheet";
  range?: string;
  columnMappingJson?: string;
  limitRows?: number;
  useFirstRowAsHeaders?: boolean;
  matchColumn?: string;
  matchValue?: string;
};

type GoogleSheetsNodeType = Node<GoogleSheetsNodeData>;

const operationLabel: Record<
  NonNullable<GoogleSheetsNodeData["operation"]>,
  string
> = {
  read_rows: "Read Rows",
  append_row: "Append Row",
  update_row: "Update Row",
  find_row: "Find Row",
  delete_row: "Delete Row",
  create_sheet: "Create Sheet",
};

export const GoogleSheetsNode = memo(
  (props: NodeProps<GoogleSheetsNodeType>) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const { setNodes } = useReactFlow();

    const nodeStatus = useNodeStatus({
      nodeId: props.id,
      channel: GOOGLE_SHEETS_CHANNEL_NAME,
      topic: "status",
      refreshToken: fetchGoogleSheetsRealtimeToken,
    });

    const handleOpenSettings = () => setDialogOpen(true);

    const handleSubmit = (values: GoogleSheetsFormValues) => {
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
    const operation = nodeData?.operation || "read_rows";
    const description = nodeData?.spreadsheetId
      ? `${operationLabel[operation]}: ${nodeData.sheetName || "Sheet"}`
      : "Not configured";

    return (
      <>
        <GoogleSheetsDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubmit={handleSubmit}
          defaultValues={nodeData}
        />
        <BaseExecutionNode
          {...props}
          id={props.id}
          icon="/logos/googlesheets.svg"
          name="Google Sheets"
          status={nodeStatus}
          description={description}
          onSetting={handleOpenSettings}
          onDoubleClick={handleOpenSettings}
        />
      </>
    );
  },
);

GoogleSheetsNode.displayName = "GoogleSheetsNode";
