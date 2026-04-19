"use client";

import {
  BotIcon,
  SendIcon,
  XIcon,
  Loader2Icon,
  CheckCircle2Icon,
  AlertCircleIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AiWorkflowPlan } from "../lib/ai-workflow-schema";
import { useSupportChat } from "../hooks/use-workflows";

interface SupportChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  suggestedActions?: Array<{
    type: "fix" | "learn" | "run";
    label: string;
    description: string;
  }>;
}

interface WorkflowSupportChatProps {
  workflowId: string;
  workflowPlan: AiWorkflowPlan;
  onClose?: () => void;
  preferredProvider?: "openai" | "gemini" | "anthropic";
}

export const WorkflowSupportChat = ({
  workflowId,
  workflowPlan,
  onClose,
  preferredProvider,
}: WorkflowSupportChatProps) => {
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "guide">("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { mutateAsync: askSupport } = useSupportChat();

  // Load messages from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    try {
      const storageKey = `flowforge-support-chat-${workflowId}`;
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as SupportChatMessage[];
        setMessages(parsed);
      }
    } catch (error) {
      console.error("Failed to load support chat messages:", error);
    }
  }, [workflowId]);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (typeof window === "undefined" || messages.length === 0) return;
    
    try {
      const storageKey = `flowforge-support-chat-${workflowId}`;
      window.localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch (error) {
      console.error("Failed to save support chat messages:", error);
    }
  }, [messages, workflowId]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");

    // Add user message to chat
    const userMessageObj: SupportChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessageObj]);
    setLoading(true);

    try {
      const response = await askSupport({
        workflowPlan,
        userMessage,
        conversationHistory: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        preferredProvider,
      });

      const assistantMessage: SupportChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response.message,
        timestamp: new Date(),
        suggestedActions: response.suggestedActions,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: SupportChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}. Please try again.`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const quickQuestions = [
    "What does [object Object] mean and how do I fix it?",
    "Why am I getting a 401 Unauthorized error?",
    "How do I reference variables in my workflow?",
    "Why isn't my workflow outputting data?",
    "How do I debug my workflow execution?",
  ];

  const handleQuickQuestion = (question: string) => {
    setInput(question);
  };

  return (
    <div className="flex flex-col h-full bg-background w-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-2">
          <BotIcon className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Workflow Support</h3>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <XIcon className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "chat" | "guide")}
        className="flex-1 flex flex-col min-h-0"
      >
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 shrink-0">
          <TabsTrigger
            value="chat"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
          >
            Chat
          </TabsTrigger>
          <TabsTrigger
            value="guide"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
          >
            Quick Guide
          </TabsTrigger>
        </TabsList>

        {/* Chat Tab */}
        <TabsContent value="chat" className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-4 p-4 pb-20">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  <BotIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm font-medium">Ask me anything about your workflow</p>
                  <p className="text-xs mt-2">
                    I can help with variable references, debugging, and troubleshooting
                  </p>
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <BotIcon className="w-4 h-4 text-primary" />
                    </div>
                  )}

                  <div
                    className={`max-w-xs px-3 py-2 rounded-lg ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                    {message.suggestedActions && message.suggestedActions.length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-current opacity-70 pt-3">
                        {message.suggestedActions.map((action, idx) => (
                          <button
                            key={idx}
                            className="w-full text-left text-xs hover:opacity-80 transition-opacity flex items-center gap-2"
                          >
                            {action.type === "fix" && (
                              <CheckCircle2Icon className="w-3 h-3" />
                            )}
                            {action.type === "learn" && (
                              <AlertCircleIcon className="w-3 h-3" />
                            )}
                            {action.type === "run" && (
                              <ExternalLinkIcon className="w-3 h-3" />
                            )}
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2Icon className="w-4 h-4 text-primary animate-spin" />
                </div>
                <div className="bg-muted px-3 py-2 rounded-lg">
                  <p className="text-sm text-muted-foreground">Thinking...</p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
          </ScrollArea>

          {/* Quick Questions */}
          {messages.length === 0 && (
            <div className="border-t p-3 bg-muted/50 shrink-0 overflow-y-auto max-h-[120px]">
              <p className="text-xs font-medium mb-2 text-muted-foreground">
                Common questions:
              </p>
              <div className="space-y-2">
                {quickQuestions.map((question, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleQuickQuestion(question)}
                    className="w-full text-left text-xs p-2 rounded hover:bg-background transition-colors border"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area - Fixed at Bottom */}
          <div className="border-t p-3 bg-background shrink-0">
            <div className="flex gap-2">
              <Input
                placeholder="Ask about your workflow..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                disabled={loading}
                className="text-sm"
              />
              <Button
                size="sm"
                onClick={handleSendMessage}
                disabled={loading || !input.trim()}
              >
                <SendIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Guide Tab */}
        <TabsContent value="guide" className="flex-1 overflow-hidden min-h-0">
          <ScrollArea className="h-full w-full p-4">
            <div className="space-y-6 pr-4">
              {/* Variable Reference Guide */}
              <section>
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <AlertCircleIcon className="w-4 h-4" />
                  Variable References
                </h4>
                <div className="space-y-3 text-sm">
                  <div className="bg-muted p-3 rounded">
                    <p className="font-mono text-xs text-primary mb-1">
                      HTTP Request Output
                    </p>
                    <p className="text-muted-foreground">
                      {`{{variableName.httpResponse.data}}`}
                    </p>
                  </div>

                  <div className="bg-muted p-3 rounded">
                    <p className="font-mono text-xs text-primary mb-1">
                      AI Node Output
                    </p>
                    <p className="text-muted-foreground">
                      {`{{variableName.text}}`}
                    </p>
                  </div>

                  <div className="bg-muted p-3 rounded">
                    <p className="font-mono text-xs text-primary mb-1">
                      Nested Field Access
                    </p>
                    <p className="text-muted-foreground">
                      {`{{data.httpResponse.data[0].title}}`}
                    </p>
                  </div>
                </div>
              </section>

              <Separator />

              {/* Common Errors */}
              <section>
                <h4 className="font-semibold text-sm mb-3">Common Errors</h4>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium text-red-600">[object Object]</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Use specific field paths instead of whole objects
                    </p>
                  </div>

                  <div>
                    <p className="font-medium text-red-600">401 Unauthorized</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Add Authorization header with your API key
                    </p>
                  </div>

                  <div>
                    <p className="font-medium text-red-600">Variable Undefined</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Check variable names match exactly (case-sensitive)
                    </p>
                  </div>
                </div>
              </section>

              <Separator />

              {/* Current Workflow Info */}
              <section>
                <h4 className="font-semibold text-sm mb-3">Workflow Summary</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nodes:</span>
                    <span className="font-medium">{workflowPlan.nodes.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Connections:</span>
                    <span className="font-medium">
                      {workflowPlan.connections.length}
                    </span>
                  </div>
                  <div className="mt-3 p-2 bg-muted rounded">
                    <p className="text-muted-foreground mb-2">Node Types:</p>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(new Set(workflowPlan.nodes.map((n) => n.type))).map(
                        (type) => (
                          <span
                            key={type}
                            className="px-2 py-1 bg-background rounded text-xs"
                          >
                            {type}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};
