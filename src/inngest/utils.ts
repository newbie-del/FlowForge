import { Connection, Node } from "@/generated/prisma";
import toposort from "toposort";

export const topologicalSort = (
    nodes: Node[],
    connections: Connection[],
): Node[] => {
    // If now connections, return nodes as is
    if (connections.length === 0) {
        return nodes;
    }

    // Create edges for toposort
    const edges: [string, string][] = connections.map((conn) => [
        conn.fromNodeId,
        conn.toNodeId,
    ]);

    //Add nodes with no connections as self-edges to ensure they are included
    const connectionNodeIds = new Set<string>();
    for (const conn of connections) {
        connectionNodeIds.add(conn.fromNodeId);
        connectionNodeIds.add(conn.toNodeId);
    }

    for (const node of nodes) {
        if (!connectionNodeIds.has(node.id)) {
            edges.push([node.id, node.id]);
        }
    }

    //Perform topological sort
    let sortedNodeIds: string[];
    try {
        sortedNodeIds = toposort(edges);
        //Remove duplicate from self-edges
        sortedNodeIds = [...new Set(sortedNodeIds)];
    } catch (error) {
        if (error instanceof Error && error.message.includes("Cyclic")) {
            throw new Error( "Workflow contains a cycle");
        }
        throw error;
    }

    //Map sorted IDs back to nodes
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    return sortedNodeIds.map((id) => nodeMap.get(id)!).filter(Boolean);
};
    
