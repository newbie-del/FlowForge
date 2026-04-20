"use client";

import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { ReactNode } from "react";

import { BaseNode } from "./base-node";

export type PlaceholderNodeProps = Partial<NodeProps> & {
  children?: ReactNode;
  onClick?: () => void;
};

export function PlaceholderNode({ children, onClick }: PlaceholderNodeProps) {
  return (
    <BaseNode
      className="w-auto h-auto border-dashed border-gray-400 bg-card p-4 text-center text-gray-400 shadow-none cursor-pointer hover:border-gray-500 hover:bg-gray-50"
      onClick={onClick} // ✅ simple click only
    >
      {children}

      <Handle
        type="target"
        style={{ visibility: "hidden" }}
        position={Position.Top}
        isConnectable={false}
      />

      <Handle
        type="source"
        style={{ visibility: "hidden" }}
        position={Position.Bottom}
        isConnectable={false}
      />
    </BaseNode>
  );
}

PlaceholderNode.displayName = "PlaceholderNode";
