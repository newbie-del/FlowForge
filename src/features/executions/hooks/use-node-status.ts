import type { Realtime } from "@inngest/realtime";
import {useInngestSubscription} from "@inngest/realtime/hooks";
import { useEffect, useState } from "react";
import type { NodeStatus } from "@/components/react-flow/node-status-indicator";

interface UseNodeStatusOptions {
    nodeId: string;
    channel: string;
    topic: string;
    refreshToken: () => Promise<Realtime.Subscribe.Token>;
};

export function useNodeStatus({
    nodeId,
    channel,
    topic,
    refreshToken,
}: UseNodeStatusOptions) {
    const [status, setStatus] = useState<NodeStatus>("initial");
    const {data, state, error} = useInngestSubscription({
        refreshToken,
        enabled: true,
    });

    console.log('[useNodeStatus] Subscription state:', state, 'for node:', nodeId);
    console.log('[useNodeStatus] Subscription error:', error);
    console.log('[useNodeStatus] Data received:', data?.length, 'messages');

    useEffect(() => {
        console.log('[useNodeStatus] Effect triggered, data length:', data?.length);
        if (!data?.length) {
            return;
        } 

        console.log('[useNodeStatus] All messages:', JSON.stringify(data, null, 2));

        //find the latest message for the node
        const lastMessage = data
            .filter(
                (msg) =>
                msg.kind === "data" &&
                msg.channel === channel &&
                msg.topic === topic &&
                msg.data.nodeId === nodeId
            )
            .sort((a, b) => {
                if (a.kind === "data" && b.kind === "data") {
                    return (
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    );
                }
                return 0;
            })[0];

            console.log('[useNodeStatus] Last message for node:', lastMessage);

            if (lastMessage?.kind === "data") {
                console.log('[useNodeStatus] Setting status to:', lastMessage.data.status);
                setStatus(lastMessage.data.status as NodeStatus);
            }
    }, [data, channel, topic, nodeId]);

    console.log('[useNodeStatus] Returning status:', status);
    return status;
    
};