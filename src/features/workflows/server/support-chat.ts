import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { CredentialType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import type { AiWorkflowPlan } from "../lib/ai-workflow-schema";

interface SupportChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SupportChatInput {
  userId: string;
  workflowPlan: AiWorkflowPlan;
  userMessage: string;
  conversationHistory: SupportChatMessage[];
  preferredProvider?: "openai" | "gemini" | "anthropic";
}

interface SupportChatResponse {
  message: string;
  suggestedActions?: Array<{
    type: "fix" | "learn" | "run";
    label: string;
    description: string;
  }>;
  codeExample?: string;
}

// Common issues knowledge base
const COMMON_ISSUES = `
## Common Workflow Issues & Solutions

### Issue: "[object Object]" in Discord/Email/Output
**Symptom**: Message shows "[object Object]" instead of actual data
**Cause**: Using entire object instead of specific field path
**Solution**: Extract specific fields using nested property access
**Example**: 
  WRONG: {{httpData}}
  RIGHT: {{httpData.httpResponse.data.title}}

### Issue: HTTP 401 Unauthorized
**Symptom**: HTTP node fails with 401 status
**Cause**: Missing or incorrect authentication headers
**Solution**: Add headersJson field to HTTP node with proper auth
**Example**:
  headersJson: {"Authorization": "Bearer YOUR_TOKEN"}

### Issue: Variable Undefined
**Symptom**: Template variable not found: {{variableName}}
**Cause**: Variable name doesn't match node output
**Solution**: Check variable names in each node configuration
**Tip**: Variable names are case-sensitive and must match exactly

### Issue: Empty Payload to Last Node
**Symptom**: Last node receives nothing (Discord/Email empty)
**Cause**: Previous node output not properly referenced
**Solution**: Check if variable path is correct and node executed successfully
**Debug**: Look at execution logs to see what previous node output

### Issue: Data Type Mismatch
**Symptom**: AI node receives array but expects string
**Cause**: Wrong field extraction or incorrect transformation
**Solution**: Use OPENAI/GEMINI node to transform data format
**Example**: Use {{json jobs.httpResponse.data}} to pass arrays safely

### Issue: Credentials Not Found
**Symptom**: Node says "Credential not found"
**Cause**: Credential deleted or ID changed
**Solution**: Re-add credential or update node configuration

### Issue: Webhook URL Invalid
**Symptom**: Discord/Slack node fails with webhook error
**Cause**: Webhook URL expired, malformed, or missing
**Solution**: Generate new webhook URL and update node configuration

### Issue: Transformation Node Missing
**Symptom**: Workflow generates too much data to use
**Cause**: No filtering/summarization between API and output
**Solution**: Add OPENAI/GEMINI node to filter, summarize, or format data

### Issue: Scheduling Not Working
**Symptom**: Workflow doesn't run on schedule
**Cause**: Manual trigger doesn't support scheduling yet
**Solution**: Use external cron job or set up Inngest scheduling
**Workaround**: External job service can call workflow API

### Issue: Node Connection Error
**Symptom**: Next node says input not found
**Cause**: Previous node not in correct execution order
**Solution**: Check workflow flow and variable references match node execution order

## Variable Reference Guide

### HTTP_REQUEST Output
- Pattern: {{variableName.httpResponse.data}}
- Includes: status, statusText, headers, data (actual response)
- Example: {{jobs.httpResponse.data[0].title}}

### OPENAI/GEMINI/ANTHROPIC Output
- Pattern: {{variableName.text}}
- Includes: text (generated content), usage (token count)
- Example: {{summary.text}}

### Trigger Outputs
- MANUAL_TRIGGER: No output (empty context)
- GOOGLE_FORM_TRIGGER: {{formResponse.responses}}
- STRIPE_TRIGGER: {{stripeEvent.data}}

### Node Configuration Tips
- Always use headersJson as JSON string: {"key": "value"}
- Template variables work in: endpoint, body, messageBody, content, userPrompt
- Variable names are case-sensitive
- Use {{json variable}} for complex data structures
`;

async function selectSupportChatModel(
  userId: string,
  preferredProvider?: "openai" | "gemini" | "anthropic",
) {
  const getOpenAiModel = async () => {
    const credential = await prisma.credential.findFirst({
      where: { userId, type: CredentialType.OPENAI },
      orderBy: { updatedAt: "desc" },
    });

    if (!credential) {
      return null;
    }

    const openai = createOpenAI({
      apiKey: decrypt(credential.value),
    });

    return openai("gpt-4o-mini");
  };

  const getGeminiModel = async () => {
    const credential = await prisma.credential.findFirst({
      where: { userId, type: CredentialType.GEMINI },
      orderBy: { updatedAt: "desc" },
    });

    if (!credential) {
      return null;
    }

    const google = createGoogleGenerativeAI({
      apiKey: decrypt(credential.value),
    });

    return google("gemini-2.5-flash");
  };

  const getAnthropicModel = async () => {
    const credential = await prisma.credential.findFirst({
      where: { userId, type: CredentialType.ANTHROPIC },
      orderBy: { updatedAt: "desc" },
    });

    if (!credential) {
      return null;
    }

    const anthropic = createAnthropic({
      apiKey: decrypt(credential.value),
    });

    return anthropic("claude-3-5-sonnet-20241022");
  };

  if (preferredProvider === "openai") {
    const model = await getOpenAiModel();
    if (model) return model;
  }

  if (preferredProvider === "gemini") {
    const model = await getGeminiModel();
    if (model) return model;
  }

  if (preferredProvider === "anthropic") {
    const model = await getAnthropicModel();
    if (model) return model;
  }

  // Fallback to Gemini as default for support chat
  const geminiModel = await getGeminiModel();
  if (geminiModel) return geminiModel;

  const openaiModel = await getOpenAiModel();
  if (openaiModel) return openaiModel;

  const anthropicModel = await getAnthropicModel();
  if (anthropicModel) return anthropicModel;

  throw new Error(
    "No AI credentials available. Please add Gemini, OpenAI, or Anthropic credentials.",
  );
}

function buildWorkflowContext(plan: AiWorkflowPlan): string {
  const nodesList = plan.nodes
    .map((node, idx) => {
      const config = Object.entries(node.data ?? {})
        .filter(([key]) => !key.startsWith("_"))
        .map(([key, value]) => {
          if (typeof value === "object") {
            return `${key}: ${JSON.stringify(value)}`;
          }
          return `${key}: ${String(value).substring(0, 50)}`;
        })
        .join("\n  ");

      return `Node ${idx + 1}: ${node.type} (ID: ${node.id})
  Config:
  ${config}`;
    })
    .join("\n\n");

  const connectionsList = plan.connections
    .map((conn) => `${conn.from} → ${conn.to}`)
    .join("\n");

  return `
## Current Workflow Structure

### Nodes:
${nodesList}

### Connections:
${connectionsList}

### Potential Issues Detected:
${detectWorkflowIssues(plan)}
`;
}

function detectWorkflowIssues(plan: AiWorkflowPlan): string {
  const issues: string[] = [];

  // Check for missing headers on HTTP nodes
  const httpNodes = plan.nodes.filter((n) => n.type === "HTTP_REQUEST");
  httpNodes.forEach((node) => {
    const headersJson = node.data?.headersJson;
    if (!headersJson || headersJson === "{}" || headersJson === "undefined") {
      issues.push(
        `- HTTP node "${node.id}" may need authorization headers (check API docs)`,
      );
    }
  });

  // Check for variable references
  const variableRefs = plan.nodes
    .flatMap((n) => [
      n.data?.userPrompt,
      n.data?.content,
      n.data?.messageBody,
      n.data?.endpoint,
    ])
    .filter((v) => typeof v === "string");

  const usedVariables =
    variableRefs
      .join(" ")
      .match(/\{\{([^}]+)\}\}/g)
      ?.map((v) => v.replace(/[{}]/g, "").split(".")[0]) ?? [];

  const outputVariables = new Set<string>();
  plan.nodes.forEach((node) => {
    if (node.data?.variableName) {
      outputVariables.add(node.data.variableName);
    }
  });

  usedVariables.forEach((varName) => {
    if (!outputVariables.has(varName) && varName !== "json") {
      issues.push(`- Variable "${varName}" is referenced but never defined`);
    }
  });

  // Check for orphan nodes
  const allNodeIds = new Set(plan.nodes.map((n) => n.id));
  const connectedNodeIds = new Set<string>();
  plan.connections.forEach((conn) => {
    connectedNodeIds.add(conn.from);
    connectedNodeIds.add(conn.to);
  });

  allNodeIds.forEach((id) => {
    if (
      !connectedNodeIds.has(id) &&
      !plan.nodes.find((n) => n.id === id)?.type?.includes("TRIGGER")
    ) {
      issues.push(`- Node "${id}" is not connected to workflow`);
    }
  });

  return issues.length > 0 ? issues.join("\n") : "- No obvious issues detected";
}

export async function generateSupportChatResponse(
  input: SupportChatInput,
): Promise<SupportChatResponse> {
  const model = await selectSupportChatModel(
    input.userId,
    input.preferredProvider,
  );

  const workflowContext = buildWorkflowContext(input.workflowPlan);

  const systemPrompt = `You are a helpful Flowforge Workflow Assistant. You help users troubleshoot workflow issues, understand variable references, and fix configuration problems.

You have deep knowledge of:
- Flowforge node types and their input/output schemas
- Common workflow issues and how to debug them
- Variable referencing patterns and template syntax
- API integration best practices
- Authentication and credential setup

${COMMON_ISSUES}

When helping users:
1. First, understand their specific problem from their message
2. Look at their current workflow context to give targeted advice
3. Provide code examples or specific configuration steps
4. Suggest debugging approaches if the issue isn't obvious
5. Offer to help with related tasks

Be concise but complete. Focus on solving their immediate problem first.`;

  const conversationContext = input.conversationHistory
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join("\n");

  const fullPrompt = `${workflowContext}

## Conversation History:
${conversationContext}

## User's Latest Question:
${input.userMessage}

Provide a helpful response that:
- Directly answers their question
- References their workflow if relevant
- Provides specific code examples or steps
- Suggests next actions if applicable`;

  const response = await generateText({
    model,
    system: systemPrompt,
    prompt: fullPrompt,
    temperature: 0.7,
  });

  // Parse response for suggested actions
  const suggestedActions = parseActionSuggestions(response.text);

  return {
    message: response.text,
    suggestedActions,
  };
}

function parseActionSuggestions(
  responseText: string,
): SupportChatResponse["suggestedActions"] {
  const suggestions: SupportChatResponse["suggestedActions"] = [];

  // Look for common patterns in the response
  if (responseText.includes("add") && responseText.includes("header")) {
    suggestions.push({
      type: "fix",
      label: "Add Authorization Header",
      description: "Update HTTP node with authentication",
    });
  }

  if (responseText.includes("[object Object]")) {
    suggestions.push({
      type: "learn",
      label: "Learn: Variable Path Extraction",
      description: "How to extract specific fields from API responses",
    });
  }

  if (responseText.includes("should run") || responseText.includes("execute")) {
    suggestions.push({
      type: "run",
      label: "Test Workflow",
      description: "Run workflow to verify the fix",
    });
  }

  return suggestions.length > 0 ? suggestions : undefined;
}
