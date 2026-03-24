"use client";

import {useState, useCallback, useEffect} from "react";
import{
    ReactFlow,
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
    type Node,
    type Edge,
    type NodeChange,
    type EdgeChange,
    type Connection,
    Background,
    Controls,
    MiniMap,
    Panel,

} from "@xyflow/react";
import { ErrorView, LoadingView } from "@/components/entity-components";
import { useSuspenseWorkflow } from "@/features/workflows/hooks/use-workflows";
import "@xyflow/react/dist/style.css";
import { nodeComponents } from "@/config/node-components";
import { normalizeNodeType } from "@/lib/node-type";
import { AddNodeButton } from "./add-node-button";
import { useSetAtom } from "jotai";
import { editorAtom } from "../store/atoms";

export const EditorLoading = () => {
    return <LoadingView message = "Loading editor..." />;
};

export const EditorError = () => {
    return <ErrorView message="Error loading editor"/>
};

export const Editor = ({ workflowId }: { workflowId: string }) => {
    const { 
        data: workflow 
    } = useSuspenseWorkflow(workflowId);

    const setEditor = useSetAtom(editorAtom);

    const [nodes, setNodes] = useState<Node[]>(workflow.nodes);
    const [edges, setEdges] = useState<Edge[]>(workflow.edges);

    useEffect(() => {
        console.log("[flowforge][editor] nodeTypes keys", Object.keys(nodeComponents));
    }, []);

    useEffect(() => {
        console.log("[flowforge][editor] nodes state", nodes.map((node) => ({
            id: node.id,
            type: node.type,
            normalizedType: normalizeNodeType(String(node.type)),
            position: node.position,
        })));
    }, [nodes]);

    useEffect(() => {
        console.log("[flowforge][editor] initial workflow nodes", workflow.nodes.map((node) => ({
            id: node.id,
            type: node.type,
            normalizedType: normalizeNodeType(String(node.type)),
        })));
    }, [workflow.nodes]);
    
    const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)),
    [],
  );
  const onConnect = useCallback(
    (params: Connection) => setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot)),
    [],
  );

    return (
        <div className="size-full">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeComponents}
                onInit={setEditor}
                fitView
                snapGrid={[10, 10]}
                snapToGrid
                panOnScroll
                panOnDrag={false}
                selectionOnDrag
                proOptions={{
                    hideAttribution: true
                }}
            >
                <Background />
                <Controls />
                <MiniMap />
                <Panel position="top-right">
                    <AddNodeButton />
                </Panel>
            </ReactFlow>
        </div>
    );
};
