"use client";

import type { NodeProps } from "@xyflow/react";
import { Clock3Icon } from "lucide-react";
import { memo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useNodeStatus } from "@/features/executions/hooks/use-node-status";
import { SCHEDULE_TRIGGER_CHANNEL_NAME } from "@/inngest/channels/schedule-trigger";
import { BaseTriggerNode } from "../base-trigger-node";
import { fetchScheduleTriggerRealtimeToken } from "./actions";
import { ScheduleTriggerDialog } from "./dialog";
import type { ScheduleTriggerData } from "./types";

function formatPreview(value: string | null | undefined) {
  if (!value) {
    return "No next run";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const ScheduleTriggerNode = memo((props: NodeProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const data = (props.data ?? {}) as ScheduleTriggerData;

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: SCHEDULE_TRIGGER_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchScheduleTriggerRealtimeToken,
  });

  const handleOpenSettings = () => setDialogOpen(true);
  const nextRunLabel = formatPreview(data.nextRunAt);
  const nodeDescription = `Runs on schedule · ${nextRunLabel}`;

  return (
    <>
      <ScheduleTriggerDialog
        nodeId={props.id}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultValues={data}
      />
      <BaseTriggerNode
        {...props}
        icon={Clock3Icon}
        name="Schedule Trigger"
        description={nodeDescription}
        status={nodeStatus}
        onSetting={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      >
        <div className="absolute -top-1 right-0 pointer-events-none">
          <Badge
            variant={data.enabled ? "default" : "secondary"}
            className="h-3 px-1 text-[7px] leading-none rounded-sm"
          >
            {data.enabled ? "Active" : "Paused"}
          </Badge>
        </div>
      </BaseTriggerNode>
    </>
  );
});

ScheduleTriggerNode.displayName = "ScheduleTriggerNode";
