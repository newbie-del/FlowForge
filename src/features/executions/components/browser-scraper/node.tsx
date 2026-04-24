"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { GlobeIcon } from "lucide-react";
import { memo, useState } from "react";
import { BROWSER_SCRAPER_NODE_CHANNEL_NAME } from "@/inngest/channels/browser-scraper-node";
import { useNodeStatus } from "../../hooks/use-node-status";
import { BaseExecutionNode } from "../base-execution-node";
import { fetchBrowserScraperRealtimeToken } from "./actions";
import { BrowserScraperDialog, type BrowserScraperFormValues } from "./dialog";

type BrowserScraperNodeData = {
  variableName?: string;
  url?: string;
  method?: "GET" | "POST";
  mode?: "simple_fetch" | "html_scrape" | "extract_data";
  requestBody?: string;
  headersJson?: string;
  userAgent?: "default" | "chrome" | "firefox" | "custom";
  customUserAgent?: string;
  timeoutMs?: number;
  followRedirects?: boolean;
  selectors?: Array<{
    key?: string;
    selector?: string;
    extract?: "text" | "html" | "attr";
    attr?: string;
    multiple?: boolean;
  }>;
};

type BrowserScraperNodeType = Node<BrowserScraperNodeData>;

export const BrowserScraperNode = memo(
  (props: NodeProps<BrowserScraperNodeType>) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const { setNodes } = useReactFlow();

    const nodeStatus = useNodeStatus({
      nodeId: props.id,
      channel: BROWSER_SCRAPER_NODE_CHANNEL_NAME,
      topic: "status",
      refreshToken: fetchBrowserScraperRealtimeToken,
    });

    const handleOpenSettings = () => setDialogOpen(true);

    const handleSubmit = (values: BrowserScraperFormValues) => {
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

    const description = props.data?.url
      ? `${props.data.mode === "extract_data" ? "Extract Data" : props.data.mode === "html_scrape" ? "HTML Scrape" : "Simple Fetch"} · ${props.data.url}`
      : "Not configured";

    return (
      <>
        <BrowserScraperDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubmit={handleSubmit}
          defaultValues={{
            variableName: props.data?.variableName,
            url: props.data?.url,
            method: props.data?.method,
            mode: props.data?.mode,
            requestBody: props.data?.requestBody,
            headersJson: props.data?.headersJson,
            userAgent: props.data?.userAgent,
            customUserAgent: props.data?.customUserAgent,
            timeoutMs: props.data?.timeoutMs,
            followRedirects: props.data?.followRedirects,
            selectors: Array.isArray(props.data?.selectors)
              ? props.data.selectors.map((selector, index) => ({
                  key: String(selector.key ?? `field${index + 1}`),
                  selector: String(selector.selector ?? ""),
                  extract:
                    selector.extract === "html" || selector.extract === "attr"
                      ? selector.extract
                      : "text",
                  attr: String(selector.attr ?? ""),
                  multiple: Boolean(selector.multiple),
                }))
              : [],
          }}
        />
        <BaseExecutionNode
          {...props}
          id={props.id}
          icon={GlobeIcon}
          name="Browser / Scraper"
          status={nodeStatus}
          description={description}
          onSetting={handleOpenSettings}
          onDoubleClick={handleOpenSettings}
        />
      </>
    );
  },
);

BrowserScraperNode.displayName = "BrowserScraperNode";
