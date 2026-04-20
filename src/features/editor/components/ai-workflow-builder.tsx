"use client";

import { type Edge, type Node, useReactFlow } from "@xyflow/react";
import {
  AlertCircle,
  BotIcon,
  CheckCircle2,
  LightbulbIcon,
  Loader2,
  RefreshCwIcon,
  SparklesIcon,
  WandSparklesIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { WorkflowSupportChat } from "@/features/workflows/components/workflow-support-chat";
import {
  useGenerateAiWorkflow,
  useSaveAiBuilderState,
} from "@/features/workflows/hooks/use-workflows";
import type {
  AiBuilderMessage,
  AiBuilderMode,
  AiWorkflowPlan,
} from "@/features/workflows/lib/ai-workflow-schema";
import { useUpgradeModal } from "@/hooks/use-upgrade-modal";

const suggestedPrompts = [
  "Send Gmail alert whenever Google Form gets response",
  "Scrape LinkedIn jobs daily and send top 10 to Discord",
  "When CSV uploaded, summarize with Gemini and email me",
  "Apply for jobs automatically and log into Google Sheets",
  "If website changes price, notify on Slack",
];

type Props = {
  workflowId: string;
  workflowAIMetadata?: Record<string, unknown> | null;
};

type StoredBuilderState = {
  history: AiBuilderMessage[];
  plan: AiWorkflowPlan | null;
  activeTab: "workflow" | "support";
  isOpen: boolean;
};

type WorkflowAIMetadata = {
  generated?: boolean;
  prompt?: string;
  messages?: AiBuilderMessage[];
  plan?: AiWorkflowPlan | null;
  provider?: "openai" | "gemini" | "anthropic";
};

export const AiWorkflowBuilder = ({
  workflowId,
  workflowAIMetadata,
}: Props) => {
  const { getNodes, getEdges, setNodes, setEdges } = useReactFlow();
  const generateAiWorkflow = useGenerateAiWorkflow();
  const saveAiBuilderState = useSaveAiBuilderState();
  const { handleError, modal } = useUpgradeModal();

  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<AiBuilderMessage[]>([]);
  const [plan, setPlan] = useState<AiWorkflowPlan | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showWorkflowExplanation, setShowWorkflowExplanation] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [preferredProvider, setPreferredProvider] = useState<
    "openai" | "gemini" | "anthropic" | undefined
  >(undefined);
  const [activeBuilderTab, setActiveBuilderTab] = useState<
    "workflow" | "support"
  >("workflow");

  const storageKey = `flowforge-ai-builder-${workflowId}`;

  // Load from database AI metadata first, then localStorage
  useEffect(() => {
    // Load from database AI metadata if available
    if (workflowAIMetadata && typeof workflowAIMetadata === "object") {
      try {
        const metadata = workflowAIMetadata as WorkflowAIMetadata;
        if (metadata.generated === true) {
          setPrompt(metadata.prompt || "");
          setHistory(Array.isArray(metadata.messages) ? metadata.messages : []);
          setPlan(metadata.plan ?? null);
          setSelectedNodeId(metadata.plan?.nodes?.[0]?.id ?? null);
          if (
            metadata.provider === "openai" ||
            metadata.provider === "gemini" ||
            metadata.provider === "anthropic"
          ) {
            setPreferredProvider(metadata.provider);
          }
          // Automatically open AI builder if workflow was AI-generated
          setOpen(true);
          setActiveBuilderTab("workflow");
          return;
        }
      } catch (error) {
        console.error("[AI Builder] Error loading database metadata:", error);
      }
    }

    // Fallback to localStorage for unsaved session state
    if (typeof window === "undefined") {
      return;
    }

    const rawState = window.localStorage.getItem(storageKey);
    if (!rawState) {
      return;
    }

    try {
      const parsed = JSON.parse(rawState) as StoredBuilderState;
      setHistory(Array.isArray(parsed.history) ? parsed.history : []);
      setPlan(parsed.plan ?? null);
      setSelectedNodeId(parsed.plan?.nodes?.[0]?.id ?? null);
      if (parsed.activeTab === "workflow" || parsed.activeTab === "support") {
        setActiveBuilderTab(parsed.activeTab);
      }
      if (typeof parsed.isOpen === "boolean") {
        setOpen(parsed.isOpen);
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, [workflowAIMetadata, storageKey]);

  // Persist to localStorage whenever state changes
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const snapshot: StoredBuilderState = {
      history,
      plan,
      activeTab: activeBuilderTab,
      isOpen: open,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, [history, plan, activeBuilderTab, open, storageKey]);

  const selectedNode = useMemo(
    () => plan?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [plan, selectedNodeId],
  );

  const runGeneration = async (mode: AiBuilderMode) => {
    const trimmedPrompt = prompt.trim();
    const lastUserPrompt = [...history]
      .reverse()
      .find((item) => item.role === "user");
    const effectivePrompt =
      trimmedPrompt ||
      lastUserPrompt?.content ||
      "Generate a practical workflow based on the current canvas.";

    if (!effectivePrompt) {
      toast.error("Please describe the workflow you want to build.");
      return;
    }

    const userMessage: AiBuilderMessage = {
      role: "user",
      content: effectivePrompt,
    };
    const payloadHistory = [...history, userMessage];

    setIsGenerating(true);

    try {
      const result = await generateAiWorkflow.mutateAsync({
        workflowId,
        prompt: effectivePrompt,
        mode,
        history: payloadHistory,
        preferredProvider,
        currentNodes: getNodes().map((node) => ({
          id: node.id,
          type: node.type,
          data: (node.data as Record<string, unknown>) ?? {},
        })),
        currentEdges: getEdges().map((edge) => ({
          source: edge.source,
          target: edge.target,
        })),
      });

      const assistantMessage: AiBuilderMessage = {
        role: "assistant",
        content: `${result.summary}\n\n${result.userNextSteps.join("\n")}`,
      };

      const updatedHistory = [...payloadHistory, assistantMessage];

      setHistory(updatedHistory);
      setPlan(result);
      setSelectedNodeId(result.nodes[0]?.id ?? null);
      setShowWorkflowExplanation(false);
      setPrompt("");

      // Save AI builder state to database for persistence
      try {
        await saveAiBuilderState.mutateAsync({
          workflowId,
          aiMetadata: {
            generated: true,
            prompt: effectivePrompt,
            provider: preferredProvider || "gemini",
            mode,
            messages: updatedHistory,
            plan: result,
            summary: result.summary,
            nextSteps: result.userNextSteps,
            requiredCredentials: result.requiredCredentials,
            missingInputs: result.missingInputs,
            unsupportedRequests: result.unsupportedRequests,
            plannerNotes: result.plannerNotes,
            hasManualEdits: false,
          },
        });
      } catch (dbError) {
        console.error(
          "[AI Builder] Failed to save AI state to database:",
          dbError,
        );
        // Don't fail the generation if database save fails - it's already in memory and localStorage
      }

      toast.success("Workflow generated successfully.");
    } catch (error) {
      if (handleError(error)) {
        return;
      }
      toast.error(
        error instanceof Error ? error.message : "Failed to generate workflow.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const applyToCanvas = () => {
    if (!plan) {
      toast.error("Generate a workflow first.");
      return;
    }

    const nodeIds = new Set(plan.nodes.map((node) => node.id));

    const nextNodes: Node[] = plan.nodes.map((node, index) => ({
      id: node.id,
      type: node.type,
      position: node.position ?? {
        x: 160 + index * 280,
        y: 220,
      },
      data: node.data,
    }));

    const nextEdges: Edge[] = plan.connections
      .filter(
        (connection) =>
          nodeIds.has(connection.from) && nodeIds.has(connection.to),
      )
      .map((connection, index) => ({
        id: `${connection.from}-${connection.to}-${index}`,
        source: connection.from,
        target: connection.to,
        sourceHandle: connection.fromOutput || "source-1",
        targetHandle: connection.toInput || "target-1",
      }));

    setNodes(nextNodes);
    setEdges(nextEdges);
    toast.success("Workflow applied to canvas.");
  };

  const hasValidationErrors = plan?.plannerNotes?.some((note) =>
    note.includes("ERROR:"),
  );

  return (
    <>
      {modal}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            className="bg-background flex items-center gap-2"
            size="sm"
          >
            <SparklesIcon className="size-4" />
            AI Workflow Builder
          </Button>
        </SheetTrigger>

        <SheetContent
          side="right"
          className="flex flex-col w-full sm:max-w-2xl p-0 h-screen"
        >
          {/* HEADER - Fixed */}
          <SheetHeader className="shrink-0 px-6 pt-6 pb-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <BotIcon className="size-4" />
              AI Workflow Builder
            </SheetTitle>
            <SheetDescription>
              Describe your automation. AI will generate nodes and connections.
            </SheetDescription>
          </SheetHeader>

          {/* CONTENT - Scrollable */}
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Suggested Prompts - Collapsible Section */}
            {history.length === 0 && (
              <div className="shrink-0 px-6 py-3 border-b space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Quick Start Prompts
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedPrompts.map((item) => (
                    <Button
                      key={item}
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-auto text-xs whitespace-normal px-2 py-1 text-left line-clamp-2 hover:bg-secondary/80"
                      onClick={() => setPrompt(item)}
                      disabled={isGenerating}
                    >
                      {item}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages & Workflow Plan - Scrollable Area */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="px-6 py-4 space-y-4">
                {/* Chat History */}
                {history.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">
                      Start by describing what you want to automate.
                    </p>
                    <p className="text-xs mt-2">
                      AI will create nodes, connections, and suggest next steps.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map((message, index) => (
                      <div
                        key={`${message.role}-${index}`}
                        className={`rounded-lg border p-3 text-sm ${
                          message.role === "user"
                            ? "bg-primary/5 border-primary/20 ml-4"
                            : "bg-muted/50 border-muted mr-4"
                        }`}
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide mb-1">
                          {message.role === "user"
                            ? "Your Request"
                            : "AI Response"}
                        </p>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {message.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Workflow Plan Display */}
                {plan ? (
                  <div className="rounded-lg border bg-card overflow-hidden flex flex-col h-[600px]">
                    {/* Header */}
                    <div className="border-b p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-base">
                            {plan.workflowName}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {plan.nodes.length} nodes •{" "}
                            {plan.connections.length} connections
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() =>
                            setShowWorkflowExplanation((current) => !current)
                          }
                        >
                          {showWorkflowExplanation ? "Hide" : "Explain"}
                        </Button>
                      </div>
                    </div>

                    {/* Tabs */}
                    <Tabs
                      value={activeBuilderTab}
                      onValueChange={(value) =>
                        setActiveBuilderTab(value as "workflow" | "support")
                      }
                      className="flex-1 flex flex-col overflow-hidden"
                    >
                      <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
                        <TabsTrigger
                          value="workflow"
                          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                        >
                          Workflow
                        </TabsTrigger>
                        <TabsTrigger
                          value="support"
                          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                        >
                          Support
                        </TabsTrigger>
                      </TabsList>

                      {/* Workflow Tab */}
                      <TabsContent
                        value="workflow"
                        className="flex-1 overflow-y-auto"
                      >
                        <ScrollArea className="h-full">
                          <div className="p-4 space-y-4">
                            {/* Summary & Explanation */}
                            {showWorkflowExplanation ? (
                              <div className="space-y-2">
                                <p className="text-sm font-medium">
                                  How it works:
                                </p>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                  {plan.explanation}
                                </p>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {plan.summary}
                              </p>
                            )}

                            <Separator />

                            {/* Validation Errors */}
                            {hasValidationErrors && (
                              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
                                <div className="flex gap-2 items-start">
                                  <AlertCircle className="size-4 mt-0.5 shrink-0 text-destructive" />
                                  <div>
                                    <p className="text-xs font-medium text-destructive">
                                      Validation Issues Found
                                    </p>
                                    <ul className="text-xs text-destructive/80 mt-1 space-y-1">
                                      {plan.plannerNotes
                                        ?.filter((note) =>
                                          note.includes("ERROR:"),
                                        )
                                        .map((note) => (
                                          <li key={note} className="flex gap-1">
                                            • {note.replace("ERROR: ", "")}
                                          </li>
                                        ))}
                                    </ul>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Nodes List */}
                            <div className="space-y-2">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Workflow Steps
                              </p>
                              <div className="space-y-2">
                                {plan.nodes.map((node) => (
                                  <button
                                    key={node.id}
                                    type="button"
                                    onClick={() => setSelectedNodeId(node.id)}
                                    className={`w-full text-left rounded-md border p-3 transition-colors ${
                                      selectedNodeId === node.id
                                        ? "bg-primary/10 border-primary/50"
                                        : "hover:bg-muted/50"
                                    }`}
                                  >
                                    <p className="text-sm font-medium">
                                      {node.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {node.description || `Type: ${node.type}`}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Selected Node Details */}
                            {selectedNode ? (
                              <div className="rounded-md bg-muted/30 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                  Node Details
                                </p>
                                <div className="space-y-2 text-xs">
                                  <p className="text-muted-foreground">
                                    {selectedNode.description ||
                                      "Part of the workflow chain"}
                                  </p>
                                  {Object.entries(selectedNode.data).length >
                                    0 && (
                                    <details className="cursor-pointer">
                                      <summary className="font-medium hover:underline">
                                        Configuration
                                      </summary>
                                      <pre className="mt-2 text-xs bg-background p-2 rounded border overflow-x-auto">
                                        {JSON.stringify(
                                          selectedNode.data,
                                          null,
                                          2,
                                        )}
                                      </pre>
                                    </details>
                                  )}
                                </div>
                              </div>
                            ) : null}

                            {/* Required Credentials */}
                            {plan.requiredCredentials.length > 0 ? (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                  Required Credentials
                                </p>
                                <div className="space-y-2">
                                  {plan.requiredCredentials.map((cred) => (
                                    <div
                                      key={cred.type}
                                      className="rounded-md border p-3 text-xs"
                                    >
                                      <div className="flex items-start gap-2">
                                        {cred.configured ? (
                                          <CheckCircle2 className="size-4 mt-0.5 text-green-600 shrink-0" />
                                        ) : (
                                          <AlertCircle className="size-4 mt-0.5 text-amber-600 shrink-0" />
                                        )}
                                        <div className="flex-1">
                                          <p className="font-medium">
                                            {cred.displayName}
                                          </p>
                                          <p className="text-muted-foreground mt-1">
                                            {cred.guidance}
                                          </p>
                                          {cred.configured ? (
                                            <p className="text-green-600 mt-1 text-xs">
                                              ✓ Configured
                                            </p>
                                          ) : (
                                            <p className="text-amber-600 mt-1 text-xs">
                                              ⚠ Not configured yet
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {/* Missing Inputs */}
                            {plan.missingInputs.length > 0 ? (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                  Missing Information
                                </p>
                                <div className="space-y-2">
                                  {plan.missingInputs.map((item, index) => (
                                    <div
                                      key={`${item.nodeId}-${item.field}-${index}`}
                                      className="rounded-md border p-3 text-xs"
                                    >
                                      <p className="font-medium">
                                        {item.question}
                                      </p>
                                      <p className="text-muted-foreground mt-1">
                                        {item.whyItMatters}
                                      </p>
                                      {item.example ? (
                                        <p className="text-xs text-muted-foreground mt-2 italic">
                                          Example: {item.example}
                                        </p>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {/* Setup Checklist / Next Steps */}
                            {plan.userNextSteps.length > 0 ? (
                              <div className="rounded-md bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-900 p-4">
                                <div className="flex items-start gap-2 mb-3">
                                  <CheckCircle2 className="size-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
                                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                                    Setup Checklist
                                  </p>
                                </div>
                                <div className="space-y-2">
                                  {plan.userNextSteps.map((step, index) => (
                                    <div key={step} className="flex gap-3">
                                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400 flex-shrink-0 pt-0.5">
                                        {index + 1}.
                                      </span>
                                      <p className="text-xs text-foreground leading-relaxed">
                                        {step}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {/* Unsupported Features */}
                            {plan.unsupportedRequests.length > 0 ? (
                              <div className="rounded-md border p-3 text-xs">
                                <p className="font-medium mb-2">
                                  Unsupported Features
                                </p>
                                <ul className="space-y-1 text-muted-foreground list-disc pl-5">
                                  {plan.unsupportedRequests.map((entry) => (
                                    <li key={entry}>{entry}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        </ScrollArea>
                      </TabsContent>

                      {/* Support Chat Tab */}
                      <TabsContent
                        value="support"
                        className="flex-1 overflow-hidden"
                      >
                        <WorkflowSupportChat
                          workflowId={workflowId}
                          workflowPlan={plan}
                          preferredProvider={preferredProvider}
                        />
                      </TabsContent>
                    </Tabs>
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </div>

          {/* FOOTER - Fixed */}
          <Separator />
          <div className="shrink-0 space-y-3 p-4">
            {/* AI Provider Selector */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                AI Provider
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: "openai", label: "OpenAI" },
                    { id: "gemini", label: "Gemini" },
                    { id: "anthropic", label: "Claude" },
                  ] as const
                ).map(({ id, label }) => (
                  <Button
                    key={id}
                    type="button"
                    size="sm"
                    variant={preferredProvider === id ? "default" : "outline"}
                    onClick={() =>
                      setPreferredProvider(
                        preferredProvider === id ? undefined : id,
                      )
                    }
                    disabled={isGenerating}
                    className="flex-1 sm:flex-none"
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => runGeneration("improve")}
                disabled={!plan || isGenerating}
              >
                <LightbulbIcon className="size-4" />
                <span className="hidden sm:inline">Improve</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => runGeneration("optimize")}
                disabled={!plan || isGenerating}
              >
                <WandSparklesIcon className="size-4" />
                <span className="hidden sm:inline">Optimize</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => runGeneration("fix")}
                disabled={!plan || isGenerating}
              >
                Fix
              </Button>
            </div>

            {/* Prompt Input */}
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe what you want to automate..."
              className="min-h-[80px] resize-none"
              disabled={isGenerating}
            />

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => runGeneration("generate")}
                disabled={isGenerating || !prompt.trim()}
                className="flex-1 sm:flex-none"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span className="hidden sm:inline">Generating...</span>
                  </>
                ) : (
                  <>
                    <SparklesIcon className="size-4" />
                    <span className="hidden sm:inline">Generate</span>
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => runGeneration("regenerate")}
                disabled={!plan || isGenerating}
                className="flex-1 sm:flex-none"
              >
                <RefreshCwIcon className="size-4" />
                <span className="hidden sm:inline">Regenerate</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={applyToCanvas}
                disabled={!plan || isGenerating}
                className="flex-1"
              >
                Apply to Canvas
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
