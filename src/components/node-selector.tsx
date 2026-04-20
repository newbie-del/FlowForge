"use client";

import { createId } from "@paralleldrive/cuid2";
import { useReactFlow } from "@xyflow/react";
import {
  Code2Icon,
  Clock3Icon,
  GitBranchIcon,
  GlobeIcon,
  MergeIcon,
  MailIcon,
  MousePointerIcon,
  PauseCircleIcon,
  PencilLineIcon,
  RepeatIcon,
} from "lucide-react";
import Image from "next/image";
import { useCallback } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NodeType } from "@/generated/prisma";
import {
  CODE_NODE_TYPE,
  isManualTriggerType,
  LOOP_OVER_ITEMS_NODE_TYPE,
  MERGE_NODE_TYPE,
  normalizeNodeType,
  SET_NODE_TYPE,
  SCHEDULE_TRIGGER_TYPE,
} from "@/lib/node-type";
import { Separator } from "./ui/separator";

export type NodeTypeOption = {
  type: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }> | string;
};

const triggerNodes: NodeTypeOption[] = [
  {
    type: NodeType.MANUAL_TRIGGER,
    label: "Trigger manually",
    description:
      "Runs the flow on clicking a button. Good for getting stareted quickly.",
    icon: MousePointerIcon,
  },
  {
    type: SCHEDULE_TRIGGER_TYPE,
    label: "Schedule Trigger",
    description: "Runs the flow on a recurring schedule.",
    icon: Clock3Icon,
  },
  {
    type: NodeType.GOOGLE_FORM_TRIGGER,
    label: "Google Form",
    description: "Runs the flow when a Google Form is submitted.",
    icon: "/logos/googleform.svg",
  },

  {
    type: NodeType.STRIPE_TRIGGER,
    label: "Stripe Event",
    description: "Runs the flow when a Stripe Event  is captured.",
    icon: "/logos/stripe.svg",
  },
];

const executionNodes: NodeTypeOption[] = [
  {
    type: NodeType.IF,
    label: "IF",
    description: "Branch workflow with TRUE/FALSE conditions.",
    icon: GitBranchIcon,
  },
  {
    type: NodeType.WAIT,
    label: "Wait",
    description: "Pause execution for a duration or until a target time.",
    icon: PauseCircleIcon,
  },
  {
    type: SET_NODE_TYPE,
    label: "Set",
    description: "Add or modify fields in workflow data.",
    icon: PencilLineIcon,
  },
  {
    type: MERGE_NODE_TYPE,
    label: "Merge",
    description: "Combine two branches into one output.",
    icon: MergeIcon,
  },
  {
    type: LOOP_OVER_ITEMS_NODE_TYPE,
    label: "Loop Over Items",
    description: "Iterate over array items sequentially, parallel, or in batch.",
    icon: RepeatIcon,
  },
  {
    type: CODE_NODE_TYPE,
    label: "Code",
    description: "Run custom JavaScript logic.",
    icon: Code2Icon,
  },
  {
    type: NodeType.HTTP_REQUEST,
    label: "HTTP Request",
    description: "Make an HTTP request.",
    icon: GlobeIcon,
  },

  {
    type: NodeType.GEMINI,
    label: "Gemini",
    description: "Uses Google Gemini to generate text",
    icon: "/logos/gemini.svg",
  },

  {
    type: NodeType.OPENAI,
    label: "OpenAI",
    description: "Uses OpenAI to generate text",
    icon: "/logos/openai.svg",
  },

  {
    type: NodeType.ANTHROPIC,
    label: "Anthropic",
    description: "Uses Anthropic to generate text",
    icon: "/logos/anthropic.svg",
  },

  {
    type: NodeType.DISCORD,
    label: "Discord",
    description: "Send a message to Discord",
    icon: "/logos/discord.svg",
  },

  {
    type: NodeType.SLACK,
    label: "Slack",
    description: "Send a message to Slack",
    icon: "/logos/slack.svg",
  },
  {
    type: NodeType.EMAIL,
    label: "Email",
    description: "Send an email via SMTP",
    icon: MailIcon,
  },
  {
    type: NodeType.TELEGRAM,
    label: "Telegram",
    description: "Send messages, photos, or documents to Telegram",
    icon: "/logos/telegram.svg",
  },
  {
    type: NodeType.GOOGLE_SHEETS,
    label: "Google Sheets",
    description: "Read and write spreadsheet rows",
    icon: "/logos/googlesheets.svg",
  },
];

interface NodeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function NodeSelector({
  open,
  onOpenChange,
  children,
}: NodeSelectorProps) {
  const { setNodes, getNodes, screenToFlowPosition } = useReactFlow();

  const handleNodeSelect = useCallback(
    (selection: NodeTypeOption) => {
      console.log("[flowforge][node-select] selection", {
        selectionType: selection.type,
      });

      // check if trying to add a manual trigger when there's already a trigger node in the flow
      if (isManualTriggerType(selection.type)) {
        const nodes = getNodes();

        const hasManualTrigger = nodes.some((node) =>
          isManualTriggerType(String(node.type)),
        );

        console.log(
          "[flowforge][node-select] existing nodes before add",
          nodes.map((node) => ({
            id: node.id,
            type: node.type,
            normalizedType: normalizeNodeType(String(node.type)),
          })),
        );

        if (hasManualTrigger) {
          toast.error("Only one manual trigger is allowed per workflow.");
          return;
        }
      }

      setNodes((nodes) => {
        const hasInitialTrigger = nodes.some(
          (node) => node.type === NodeType.INITIAL,
        );

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        const flowPosition = screenToFlowPosition({
          x: centerX + (Math.random() - 0.5) * 200, // add some random offset to avoid overlapping nodes
          y: centerY + (Math.random() - 0.5) * 200,
        });

        const normalizedType = normalizeNodeType(selection.type);

        if (!normalizedType) {
          toast.error("Invalid node type selected.");
          return nodes;
        }

        const newNode = {
          id: createId(),
          data: {},
          position: flowPosition,
          type: normalizedType,
        };

        console.log("[flowforge][node-select] creating node", {
          id: newNode.id,
          type: newNode.type,
          originalSelectionType: selection.type,
          hasInitialTrigger,
        });

        if (hasInitialTrigger) {
          const nextNodes = [newNode];
          console.log(
            "[flowforge][node-select] next nodes (replace initial)",
            nextNodes,
          );
          return nextNodes;
        }

        const nextNodes = [...nodes, newNode];
        console.log(
          "[flowforge][node-select] next nodes (append)",
          nextNodes.map((node) => ({
            id: node.id,
            type: node.type,
            normalizedType: normalizeNodeType(String(node.type)),
          })),
        );
        return nextNodes;
      });

      onOpenChange(false);
    },
    [setNodes, getNodes, onOpenChange, screenToFlowPosition],
  );

  const renderNodeButton = (nodeType: NodeTypeOption) => {
    const Icon = nodeType.icon;

    return (
      <button
        type="button"
        key={nodeType.type}
        className="w-full justify-start h-auto py-5 px-4 rounded-none cursor-pointer border-l-2 border-transparent hover:border-l-primary"
        onClick={() => handleNodeSelect(nodeType)}
      >
        <div className="flex items-center gap-6 w-full overflow-hidden">
          {typeof Icon === "string" ? (
            <Image
              src={Icon}
              alt={nodeType.label}
              width={20}
              height={20}
              className="size-5 object-contain rounded-sm"
            />
          ) : (
            <Icon className="size-5" />
          )}
          <div className="flex flex-col items-start text-left">
            <span className="font-medium text-sm">{nodeType.label}</span>
            <span className="text-xs text-muted-foreground">
              {nodeType.description}
            </span>
          </div>
        </div>
      </button>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>What triggers this workflow?</SheetTitle>
          <SheetDescription>
            A trigger is a step that starts the workflow.
          </SheetDescription>
        </SheetHeader>
        <div>{triggerNodes.map(renderNodeButton)}</div>
        <Separator />
        <div>{executionNodes.map(renderNodeButton)}</div>
      </SheetContent>
    </Sheet>
  );
}
