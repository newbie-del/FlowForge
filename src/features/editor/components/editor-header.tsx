"use client";

import type { Edge, Node } from "@xyflow/react";
import { useAtomValue } from "jotai";
import { SaveIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  useSuspenseWorkflow,
  useUpdateWorkflow,
  useUpdateWorkflowName,
} from "@/features/workflows/hooks/use-workflows";
import { editorAtom } from "../store/atoms";

const normalizeGraphNodeIds = (
  workflowId: string,
  nodes: Node[],
  edges: Edge[],
) => {
  const usedNodeIds = new Set<string>();
  const firstNodeIdMapping = new Map<string, string>();

  const normalizedNodes = nodes.map((node, index) => {
    const originalId = String(node.id || `node_${index + 1}`);
    const scopedId = originalId.startsWith(`${workflowId}__`)
      ? originalId
      : `${workflowId}__${originalId}`;
    let nextId = scopedId;
    let suffix = 1;

    while (usedNodeIds.has(nextId)) {
      nextId = `${scopedId}_${suffix++}`;
    }

    usedNodeIds.add(nextId);
    if (!firstNodeIdMapping.has(originalId)) {
      firstNodeIdMapping.set(originalId, nextId);
    }

    return {
      ...node,
      id: nextId,
    };
  });

  const resolveNodeId = (nodeId: string) =>
    firstNodeIdMapping.get(nodeId) ??
    (usedNodeIds.has(nodeId)
      ? nodeId
      : nodeId.startsWith(`${workflowId}__`)
        ? nodeId
        : `${workflowId}__${nodeId}`);

  const normalizedEdges = edges
    .map((edge) => ({
      ...edge,
      source: resolveNodeId(edge.source),
      target: resolveNodeId(edge.target),
    }))
    .filter(
      (edge) => usedNodeIds.has(edge.source) && usedNodeIds.has(edge.target),
    );

  return {
    nodes: normalizedNodes,
    edges: normalizedEdges,
  };
};

export const EditorSaveButton = ({ workflowId }: { workflowId: string }) => {
  const editor = useAtomValue(editorAtom);
  const saveWorkflow = useUpdateWorkflow();

  const handleSave = () => {
    if (!editor) {
      return;
    }

    const nodes = editor.getNodes();
    const edges = editor.getEdges();
    const normalizedGraph = normalizeGraphNodeIds(workflowId, nodes, edges);

    editor.setNodes(normalizedGraph.nodes);
    editor.setEdges(normalizedGraph.edges);

    saveWorkflow.mutate({
      id: workflowId,
      nodes: normalizedGraph.nodes,
      edges: normalizedGraph.edges,
    });
  };

  return (
    <div className="ml-auto">
      <Button size="sm" onClick={handleSave} disabled={saveWorkflow.isPending}>
        <SaveIcon className="size-4" />
        Save
      </Button>
    </div>
  );
};

export const EditorNameInput = ({ workflowId }: { workflowId: string }) => {
  const { data: workflow } = useSuspenseWorkflow(workflowId);
  const updateWorkflowName = useUpdateWorkflowName();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(workflow.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (workflow.name) {
      setName(workflow.name);
    }
  }, [workflow.name]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (name === workflow.name) {
      setIsEditing(false);
      return;
    }

    try {
      await updateWorkflowName.mutateAsync({
        id: workflowId,
        name,
      });
    } catch {
      setName(workflow.name);
    } finally {
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setName(workflow.name);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        disabled={updateWorkflowName.isPending}
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-7 w-auto min-w-[100px] px-2"
      />
    );
  }

  return (
    <BreadcrumbItem
      onClick={() => setIsEditing(true)}
      className="cursor-pointer hover:text-foreground transition-colors"
    >
      {workflow.name}
    </BreadcrumbItem>
  );
};

export const EditorBreadcrumbs = ({ workflowId }: { workflowId: string }) => {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link prefetch href="/workflows">
              Workflows
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <EditorNameInput workflowId={workflowId} />
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export const EditorHeader = ({ workflowId }: { workflowId: string }) => {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 bg-background">
      <SidebarTrigger />
      <div className="flex flex-row items-center justify-between gap-x-4 w-full">
        <EditorBreadcrumbs workflowId={workflowId} />
        <EditorSaveButton workflowId={workflowId} />
      </div>
    </header>
  );
};
