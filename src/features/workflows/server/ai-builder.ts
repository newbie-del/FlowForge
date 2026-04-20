import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { CredentialType, NodeType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import type {
  AiBuilderMessage,
  AiBuilderMode,
  AiWorkflowBuilderInput,
  AiWorkflowPlan,
} from "../lib/ai-workflow-schema";
import { aiWorkflowPlanSchema } from "../lib/ai-workflow-schema";
import { apiRequirementsGuide, apiSpecifications } from "../lib/node-schemas";
import { WorkflowValidator } from "../lib/workflow-validator";

type PlannerModelSelection = {
  provider: "openai" | "gemini" | "anthropic";
  model: Parameters<typeof generateObject>[0]["model"];
};

type UserCredentialSummary = {
  id: string;
  name: string;
  type: CredentialType;
};

const triggerTypes = new Set<NodeType>([
  NodeType.MANUAL_TRIGGER,
  NodeType.GOOGLE_FORM_TRIGGER,
  NodeType.STRIPE_TRIGGER,
]);

const telegramKeywords = [
  "telegram",
  "tg",
  "telegram bot",
  "telegram message",
  "telegram alert",
  "telegram notify",
  "send telegram",
  "chat id",
  "botfather",
  "notify on telegram",
  "send to telegram",
];

function hasTelegramIntent(prompt: string) {
  const lower = prompt.toLowerCase();
  return telegramKeywords.some((keyword) => lower.includes(keyword));
}

function getTelegramOperationFromPrompt(
  prompt: string,
): "send_message" | "send_photo" | "send_document" {
  const lower = prompt.toLowerCase();

  if (
    lower.includes("pdf") ||
    lower.includes("document") ||
    lower.includes("doc") ||
    lower.includes("file") ||
    lower.includes("report")
  ) {
    return "send_document";
  }

  if (
    lower.includes("image") ||
    lower.includes("photo") ||
    lower.includes("screenshot") ||
    lower.includes("picture")
  ) {
    return "send_photo";
  }

  return "send_message";
}

const credentialRequiredByNodeType: Partial<Record<NodeType, CredentialType>> =
  {
    [NodeType.OPENAI]: CredentialType.OPENAI,
    [NodeType.GEMINI]: CredentialType.GEMINI,
    [NodeType.ANTHROPIC]: CredentialType.ANTHROPIC,
    [NodeType.EMAIL]: CredentialType.SMTP,
    [NodeType.GOOGLE_SHEETS]: CredentialType.GOOGLE_SHEETS,
    [NodeType.TELEGRAM]: CredentialType.TELEGRAM_BOT,
  };

/**
 * ENHANCED NODE CATALOG with output references
 * This helps the AI understand what variables are available after each node
 */
const enhancedNodeCatalog = `
AVAILABLE FLOWFORGE NODES:

TRIGGERS (start workflows):
- MANUAL_TRIGGER: Manual workflow start. Outputs: empty context
- GOOGLE_FORM_TRIGGER: Triggered when Google Form submitted. Outputs: formResponse = { responses: {...}, timestamp }
- STRIPE_TRIGGER: Triggered on Stripe event. Outputs: stripeEvent = { type, data, id }

ACTIONS (do things):
- HTTP_REQUEST: Make API/webhook calls. Output variable name is customizable.
  Outputs: {[variableName]: { httpResponse: { status, statusText, data } }}
  Fields: endpoint (URL), method (GET|POST|PUT|PATCH|DELETE), body (JSON string for POST/PUT/PATCH)
  Examples: jobsApi, weatherApi, scraperData

- EMAIL: Send SMTP email. Output: emailResult = { success, messageId }
  Fields: credentialId, toEmail, subject, messageBody
  Important: Use template variables like {{variableName.fieldName}} to insert data

- DISCORD: Send Discord webhook message. Output: discordResult = { messageContent }
  Fields: webhookUrl, content, username, variableName
  Template: content should be {{aiResult.text}} or similar

- SLACK: Send Slack webhook message. Output: slackResult = { messageContent }
  Fields: webhookUrl, content, username, variableName
  Template: content should be {{aiResult.text}} or similar

- TELEGRAM: Send Telegram message/photo/document. Output: telegramResult = { success, messageId, chatId }
  Fields: credentialId, chatId (numeric or @username), operation (send_message|send_photo|send_document), message, parseMode (plain|markdown|html), disableNotification,
          photoSource/documentSource (url|upload|previous_node), photoUrl/documentUrl, photoBinaryTemplate/documentBinaryTemplate
  Operations:
    * send_message: Send text message. Set 'message' field. Use template variables like {{httpData.title}}
    * send_photo: Send photo with optional caption. Prefer photoSource="previous_node" when image comes from prior node; use photoBinaryTemplate like {{json screenshot.binary}}
    * send_document: Send document with optional caption. Prefer documentSource="previous_node" for prior-node file output; use documentBinaryTemplate like {{json report.binary}}
  Example: message="🎯 Job Alert: {{jobs.title}} at {{jobs.company}}", photoUrl="{{imageUrl}}"
  IMPORTANT: Telegram keywords (telegram/tg/bot/botfather/chat id) must map to TELEGRAM node as final delivery node.

- GOOGLE_SHEETS: Read/write Google Sheets. Output: sheetsResult = { success, rows }
  Fields: credentialId, spreadsheetId, sheetName, operation (append_row|update_row|find_rows)
  Template: Use columnMappingJson with {{variableName.fieldName}} for data mapping

- OPENAI/GEMINI/ANTHROPIC: AI text processing. Output variable name is customizable.
  Outputs: {[variableName]: { text, usage: { inputTokens, outputTokens } }}
  Fields: credentialId, userPrompt, systemPrompt (optional), variableName
  Important: Use {{previousNodeVariable.fieldName}} to pass data to AI

DATA FLOW RULES:
1. Every node EXCEPT manual trigger has previous data in context
2. Template variables {{variableName}} reference previous node outputs
3. For HTTP requests, data is available as {{httpVariableName.httpResponse.data}}
4. For AI nodes, output is available as {{aiVariableName.text}}
5. For Telegram, use {{variableName.httpResponse.data.field}} for photos/documents URLs
6. Always use the exact variable name you set in each node!

EXAMPLE WORKFLOW:
Prompt: "Search for React jobs daily and email top 5"
Flow:
1. Schedule Trigger (MANUAL_TRIGGER) → no output needed
2. HTTP_REQUEST with variableName="jobsApi" → fetches jobs with auth
   endpoint: "https://api.example.com/jobs?query=React"
   headersJson: "{"Authorization": "Bearer YOUR_API_KEY", "Accept": "application/json"}"
   Outputs: jobsApi = { httpResponse: { data: [...] } }
3. OPENAI with variableName="summary" → selects top 5
   userPrompt: "Pick top 5 jobs from: {{json jobsApi.httpResponse.data}}"
   Outputs: summary = { text: "job1, job2..." }
4. EMAIL → sends result
   messageBody: "Top React jobs: {{summary.text}}"
`;

function sanitizeMessages(messages: AiBuilderMessage[]) {
  return messages
    .slice(-12)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`);
}

function getNodeTitle(type: NodeType) {
  switch (type) {
    case NodeType.MANUAL_TRIGGER:
      return "Manual Trigger";
    case NodeType.GOOGLE_FORM_TRIGGER:
      return "Google Form Trigger";
    case NodeType.STRIPE_TRIGGER:
      return "Stripe Trigger";
    case NodeType.HTTP_REQUEST:
      return "HTTP Request";
    case NodeType.OPENAI:
      return "OpenAI";
    case NodeType.GEMINI:
      return "Gemini";
    case NodeType.ANTHROPIC:
      return "Anthropic";
    case NodeType.DISCORD:
      return "Discord";
    case NodeType.SLACK:
      return "Slack";
    case NodeType.EMAIL:
      return "Email";
    case NodeType.GOOGLE_SHEETS:
      return "Google Sheets";
    case NodeType.TELEGRAM:
      return "Telegram";
    case NodeType.INITIAL:
      return "Initial";
    default:
      return String(type);
  }
}

function ensureNodeDefaults(node: AiWorkflowPlan["nodes"][number]) {
  const data = node.data ?? {};

  switch (node.type) {
    case NodeType.MANUAL_TRIGGER:
      return { ...node, data: {} };
    case NodeType.HTTP_REQUEST:
      return {
        ...node,
        data: {
          variableName: String(data.variableName ?? "httpRequest"),
          endpoint: String(data.endpoint ?? ""),
          method: String(data.method ?? "GET").toUpperCase(),
          body: typeof data.body === "string" ? data.body : "",
          headersJson:
            typeof data.headersJson === "string" ? data.headersJson : "{}",
        },
      };
    case NodeType.EMAIL:
      return {
        ...node,
        data: {
          provider: String(data.provider ?? "gmail"),
          credentialId:
            typeof data.credentialId === "string" ? data.credentialId : "",
          fromEmail: String(data.fromEmail ?? ""),
          toEmail: String(data.toEmail ?? ""),
          cc: String(data.cc ?? ""),
          bcc: String(data.bcc ?? ""),
          subject: String(data.subject ?? "Workflow notification"),
          messageBody: String(data.messageBody ?? "Hello from Flowforge."),
          htmlMode: Boolean(data.htmlMode ?? false),
          attachmentsJson:
            typeof data.attachmentsJson === "string"
              ? data.attachmentsJson
              : "",
          customHost:
            typeof data.customHost === "string" ? data.customHost : "",
          customPort:
            typeof data.customPort === "number" ? data.customPort : undefined,
          customSecure: Boolean(data.customSecure ?? false),
        },
      };
    case NodeType.GOOGLE_SHEETS:
      return {
        ...node,
        data: {
          credentialId:
            typeof data.credentialId === "string" ? data.credentialId : "",
          spreadsheetId: String(data.spreadsheetId ?? ""),
          sheetName: String(data.sheetName ?? "Sheet1"),
          operation: String(data.operation ?? "append_row"),
          range: String(data.range ?? "A:ZZ"),
          columnMappingJson:
            typeof data.columnMappingJson === "string"
              ? data.columnMappingJson
              : "",
          limitRows:
            typeof data.limitRows === "number" ? data.limitRows : undefined,
          useFirstRowAsHeaders: Boolean(data.useFirstRowAsHeaders ?? true),
          matchColumn:
            typeof data.matchColumn === "string" ? data.matchColumn : "",
          matchValue:
            typeof data.matchValue === "string" ? data.matchValue : "",
        },
      };
    case NodeType.OPENAI:
    case NodeType.GEMINI:
    case NodeType.ANTHROPIC:
      return {
        ...node,
        data: {
          variableName: String(data.variableName ?? "aiResult"),
          credentialId:
            typeof data.credentialId === "string" ? data.credentialId : "",
          systemPrompt:
            typeof data.systemPrompt === "string" ? data.systemPrompt : "",
          userPrompt: String(data.userPrompt ?? ""),
        },
      };
    case NodeType.DISCORD:
    case NodeType.SLACK:
      return {
        ...node,
        data: {
          variableName: String(data.variableName ?? "notification"),
          webhookUrl: String(data.webhookUrl ?? ""),
          content: String(data.content ?? ""),
          username: typeof data.username === "string" ? data.username : "",
        },
      };
    case NodeType.TELEGRAM:
      return {
        ...node,
        data: {
          variableName: String(data.variableName ?? "telegramAlert"),
          credentialId:
            typeof data.credentialId === "string" ? data.credentialId : "",
          chatId: String(data.chatId ?? ""),
          operation: String(data.operation ?? "send_message"),
          message: String(data.message ?? "Workflow notification"),
          parseMode: String(data.parseMode ?? "plain"),
          disableNotification: Boolean(data.disableNotification ?? false),
          photoSource: String(data.photoSource ?? "url"),
          documentSource: String(data.documentSource ?? "url"),
          photoUrl: String(data.photoUrl ?? ""),
          documentUrl: String(data.documentUrl ?? ""),
          photoFileName: String(data.photoFileName ?? ""),
          photoMimeType: String(data.photoMimeType ?? ""),
          photoBase64: String(data.photoBase64 ?? ""),
          photoBinaryTemplate: String(data.photoBinaryTemplate ?? ""),
          documentFileName: String(data.documentFileName ?? ""),
          documentMimeType: String(data.documentMimeType ?? ""),
          documentBase64: String(data.documentBase64 ?? ""),
          documentBinaryTemplate: String(data.documentBinaryTemplate ?? ""),
        },
      };
    default:
      return { ...node, data };
  }
}

async function selectPlannerModel(
  userId: string,
  preferredProvider?: "openai" | "gemini" | "anthropic",
): Promise<PlannerModelSelection> {
  const getOpenAiModel = async () => {
    const credential = await prisma.credential.findFirst({
      where: { userId, type: CredentialType.OPENAI },
      orderBy: { updatedAt: "desc" },
    });
    if (!credential) return null;
    const openai = createOpenAI({ apiKey: decrypt(credential.value) });
    return { provider: "openai" as const, model: openai("gpt-4o-mini") };
  };

  const getGeminiModel = async () => {
    const credential = await prisma.credential.findFirst({
      where: { userId, type: CredentialType.GEMINI },
      orderBy: { updatedAt: "desc" },
    });
    if (!credential) return null;
    const google = createGoogleGenerativeAI({
      apiKey: decrypt(credential.value),
    });
    return { provider: "gemini" as const, model: google("gemini-2.5-flash") };
  };

  const getAnthropicModel = async () => {
    const credential = await prisma.credential.findFirst({
      where: { userId, type: CredentialType.ANTHROPIC },
      orderBy: { updatedAt: "desc" },
    });
    if (!credential) return null;
    const anthropic = createAnthropic({
      apiKey: decrypt(credential.value),
    });
    return {
      provider: "anthropic" as const,
      model: anthropic("claude-sonnet-4-5"),
    };
  };

  // If user specified a preferred provider, try that first
  if (preferredProvider === "openai") {
    const model = await getOpenAiModel();
    if (model) return model;
  } else if (preferredProvider === "gemini") {
    const model = await getGeminiModel();
    if (model) return model;
  } else if (preferredProvider === "anthropic") {
    const model = await getAnthropicModel();
    if (model) return model;
  }

  // Fall back to priority order: OpenAI → Gemini → Anthropic
  const openai = await getOpenAiModel();
  if (openai) return openai;

  const gemini = await getGeminiModel();
  if (gemini) return gemini;

  const anthropic = await getAnthropicModel();
  if (anthropic) return anthropic;

  throw new Error(
    "AI Workflow Builder requires at least one AI credential (OpenAI, Gemini, or Anthropic).",
  );
}

function buildPlannerPrompt(input: {
  mode: AiBuilderMode;
  prompt: string;
  history: AiBuilderMessage[];
  credentialsByType: Record<CredentialType, UserCredentialSummary[]>;
  currentNodes: AiWorkflowBuilderInput["currentNodes"];
  currentEdges: AiWorkflowBuilderInput["currentEdges"];
}) {
  const credentialsText = (
    Object.keys(input.credentialsByType) as CredentialType[]
  )
    .map((type) => {
      const credentials = input.credentialsByType[type];
      if (!credentials || credentials.length === 0) {
        return `${type}: none`;
      }

      return `${type}: ${credentials.map((credential) => `${credential.id} (${credential.name})`).join(", ")}`;
    })
    .join("\n");

  const currentGraphText =
    input.currentNodes.length === 0
      ? "No current nodes."
      : `Current nodes:\n${JSON.stringify(input.currentNodes, null, 2)}\nCurrent edges:\n${JSON.stringify(input.currentEdges, null, 2)}`;

  // Check if user request matches any known workflow patterns
  const requestLower = input.prompt.toLowerCase();
  let apiGuidanceText = "";
  if (
    requestLower.includes("linkedin") &&
    (requestLower.includes("job") || requestLower.includes("jobs"))
  ) {
    const guide = apiRequirementsGuide["scrape-linkedin-jobs"];
    apiGuidanceText = `
API GUIDANCE FOR THIS WORKFLOW:
Task: ${guide.task}
Required APIs: ${guide.requiredApis.join(", ")}
Required Credentials: ${guide.requiredCredentials.join(", ")}

LinkedIn API Details:
${JSON.stringify(apiSpecifications.linkedin_jobs, null, 2)}

Common Errors to Avoid:
${guide.commonErrors.map((e) => `- ${e.error}: ${e.solution}`).join("\n")}

Setup Steps:
${guide.setupSteps.map((s) => `- ${s}`).join("\n")}
`;
  } else if (
    requestLower.includes("email") &&
    (requestLower.includes("alert") || requestLower.includes("send"))
  ) {
    const guide = apiRequirementsGuide["email-alerts"];
    apiGuidanceText = `
API GUIDANCE FOR THIS WORKFLOW:
Task: ${guide.task}
Required Credentials: ${guide.requiredCredentials.join(", ")}

SMTP Details:
${JSON.stringify(apiSpecifications.smtp_email, null, 2)}

Common Errors to Avoid:
${guide.commonErrors.map((e) => `- ${e.error}: ${e.solution}`).join("\n")}
`;
  } else if (
    requestLower.includes("sheet") ||
    requestLower.includes("spreadsheet")
  ) {
    const guide = apiRequirementsGuide["sheet-logging"];
    apiGuidanceText = `
API GUIDANCE FOR THIS WORKFLOW:
Task: ${guide.task}
Required Credentials: ${guide.requiredCredentials.join(", ")}

Google Sheets Details:
${JSON.stringify(apiSpecifications.google_sheets_api, null, 2)}
`;
  }

  // Detect transformation needs (only if there are existing nodes to analyze)
  const transformationHints =
    input.currentNodes.length > 0
      ? detectTransformationNeeds(
          input.currentNodes.map((n) => ({
            id: n.id,
            type: (n.type as NodeType) ?? NodeType.MANUAL_TRIGGER,
            title: n.type ?? "Unknown",
            data: n.data ?? {},
          })) as AiWorkflowPlan["nodes"],
          input.prompt,
        )
      : [];

  const transformationText =
    transformationHints.length > 0
      ? `
DATA TRANSFORMATION REQUIREMENTS:
${transformationHints.join("\n")}
`
      : "";

  const modeInstruction: Record<AiBuilderMode, string> = {
    generate: "Create a new workflow from the request.",
    regenerate:
      "Regenerate a better version of the previous workflow proposal.",
    improve:
      "Improve the existing workflow for reliability and completeness without overcomplicating it.",
    optimize:
      "Optimize the existing workflow for fewer steps, lower cost, and clearer outputs.",
    fix: "Fix broken or missing settings in the existing workflow.",
    convert_manual:
      "Convert the current manual workflow into an AI-optimized version while keeping user intent.",
  };

  return `
You are Flowforge AI Workflow Builder.
Return ONLY valid JSON matching the schema. No markdown, no explanation.

${enhancedNodeCatalog}

CRITICAL REQUIREMENTS:
1) Use ONLY NodeType values: MANUAL_TRIGGER, GOOGLE_FORM_TRIGGER, STRIPE_TRIGGER, HTTP_REQUEST, GOOGLE_SHEETS, EMAIL, DISCORD, SLACK, TELEGRAM, OPENAI, GEMINI, ANTHROPIC
2) EVERY node must have ALL required fields set
3) Variable names in templates MUST match exact variable names from previous nodes
4) Check: if HTTP_REQUEST outputs "jobsList", then use {{jobsList.httpResponse.data}} NOT {{httpData}}
5) Last node should be action (EMAIL/DISCORD/SLACK/TELEGRAM/SHEETS), not trigger
6) Each connection must have from→to with exact node IDs
7) Create connections in sequential order: trigger→action1→action2...
8) Use meaningful variable names: jobsList, summary, filtered_results (not generic names)
9) HTTP_REQUEST nodes MUST include Authorization headers when connecting to protected APIs
   - Format: "Authorization": "Bearer {{token}}" or include in headersJson
   - Example: {"Authorization": "Bearer YOUR_API_KEY", "Accept": "application/json"}
10) Always set headersJson field for HTTP nodes connecting to APIs requiring auth
11) TELEGRAM INTENT ROUTING: if user mentions any alias (telegram, tg, telegram bot, telegram alert, telegram notify, send telegram, chat id, botfather), include TELEGRAM node and prioritize it as final notification node
12) TELEGRAM OPERATION AUTO-SET:
   - "pdf/document/file/report" -> operation=send_document
   - "image/photo/screenshot/picture" -> operation=send_photo
   - otherwise -> operation=send_message

TEMPLATE VARIABLE REFERENCE:
- {{httpVariable.httpResponse.data}} for HTTP node outputs
- {{aiVariable.text}} for AI node outputs  
- {{emailResult.success}} for Email node outputs
- Always check the DATA FLOW RULES section above

COMMON WORKFLOW PATTERN - LinkedIn Jobs to Discord:
Example Prompt: "Scrape LinkedIn jobs daily and send top 10 to Discord"
Expected nodes: SCHEDULE_TRIGGER → HTTP_REQUEST → OPENAI (format data) → DISCORD
Pattern:
1. Schedule trigger (daily)
2. HTTP_REQUEST node with LinkedIn API endpoint + Authorization header
3. OPENAI node to extract top 10 and format for Discord
4. DISCORD node with webhook URL and formatted message content
Critical: HTTP node MUST have 'headers' field with Authorization: Bearer {{linkedinToken}}
Critical: OPENAI node input should be: "Extract top 10 from {{linkedinResult.httpResponse.data}} and format as Discord-ready message"
Critical: DISCORD node 'content' field should be: {{formattedJobs.text}}

Execution mode: ${input.mode}
Instruction: ${modeInstruction[input.mode]}

User request:
${input.prompt}

Conversation history:
${sanitizeMessages(input.history).join("\n") || "No prior conversation."}

User credential inventory:
${credentialsText}

${apiGuidanceText}

${transformationText}

Current workflow graph:
${currentGraphText}

Generate a workflow that will actually execute successfully. Think about data flow carefully.
`;
}

function ensureSingleTrigger(plan: AiWorkflowPlan) {
  const triggerNodes = plan.nodes.filter((node) => triggerTypes.has(node.type));
  if (triggerNodes.length > 0) {
    return plan;
  }

  const manualTrigger = {
    id: "trigger_manual",
    type: NodeType.MANUAL_TRIGGER,
    title: getNodeTitle(NodeType.MANUAL_TRIGGER),
    description: "Manual start trigger added automatically.",
    data: {},
    position: { x: 100, y: 200 },
  } as const;

  const firstNode = plan.nodes[0];

  return {
    ...plan,
    nodes: [manualTrigger, ...plan.nodes],
    connections: firstNode
      ? [
          {
            from: manualTrigger.id,
            to: firstNode.id,
            fromOutput: "source-1",
            toInput: "target-1",
          },
          ...plan.connections,
        ]
      : plan.connections,
    plannerNotes: [
      ...plan.plannerNotes,
      "Added Manual Trigger because no supported trigger was selected.",
    ],
  };
}

function ensureConnections(plan: AiWorkflowPlan) {
  if (plan.connections.length > 0 || plan.nodes.length <= 1) {
    return plan;
  }

  const fallbackConnections = plan.nodes.slice(0, -1).map((node, index) => ({
    from: node.id,
    to: plan.nodes[index + 1]?.id ?? node.id,
    fromOutput: "source-1",
    toInput: "target-1",
  }));

  return {
    ...plan,
    connections: fallbackConnections,
    plannerNotes: [
      ...plan.plannerNotes,
      "Added sequential connections to keep the workflow runnable.",
    ],
  };
}

function ensureUniqueNodeIds(plan: AiWorkflowPlan) {
  const usedIds = new Set<string>();
  const firstIdMapping = new Map<string, string>();
  let changed = false;

  const nodes = plan.nodes.map((node, index) => {
    const originalId = String(node.id || `node_${index + 1}`);
    let nextId = originalId;
    let suffix = 1;

    while (usedIds.has(nextId)) {
      nextId = `${originalId}_${suffix++}`;
    }

    usedIds.add(nextId);
    if (!firstIdMapping.has(originalId)) {
      firstIdMapping.set(originalId, nextId);
    }

    if (nextId !== originalId) {
      changed = true;
      return { ...node, id: nextId };
    }

    return node;
  });

  const seenConnections = new Set<string>();
  const connections = plan.connections
    .map((connection) => {
      const from = firstIdMapping.get(connection.from) ?? connection.from;
      const to = firstIdMapping.get(connection.to) ?? connection.to;

      return {
        ...connection,
        from,
        to,
      };
    })
    .filter(
      (connection) =>
        usedIds.has(connection.from) && usedIds.has(connection.to),
    )
    .filter((connection) => {
      const key = `${connection.from}|${connection.to}|${connection.fromOutput}|${connection.toInput}`;
      if (seenConnections.has(key)) {
        changed = true;
        return false;
      }
      seenConnections.add(key);
      return true;
    });

  if (!changed) {
    return plan;
  }

  return {
    ...plan,
    nodes,
    connections,
    plannerNotes: [
      ...plan.plannerNotes,
      "Normalized duplicate node IDs to keep workflow persistence valid.",
    ],
  };
}

function enforceTelegramPriority(plan: AiWorkflowPlan, prompt: string) {
  if (!hasTelegramIntent(prompt)) {
    return plan;
  }

  const operation = getTelegramOperationFromPrompt(prompt);
  const telegramNode = plan.nodes.find(
    (node) => node.type === NodeType.TELEGRAM,
  );

  if (telegramNode) {
    const nextNodes = plan.nodes.map((node) => {
      if (node.id !== telegramNode.id) return node;
      return {
        ...node,
        title: "Telegram",
        data: {
          ...node.data,
          operation,
          variableName: String(node.data.variableName ?? "telegramAlert"),
          parseMode: String(node.data.parseMode ?? "plain"),
          disableNotification: Boolean(node.data.disableNotification ?? false),
        },
      };
    });

    return {
      ...plan,
      nodes: nextNodes,
      plannerNotes: [
        ...plan.plannerNotes,
        "Telegram intent detected: prioritized TELEGRAM node and aligned operation.",
      ],
    };
  }

  const lastNode = plan.nodes[plan.nodes.length - 1];
  const newTelegramNodeId = `telegram_${plan.nodes.length + 1}`;
  const firstHttpNode = plan.nodes.find(
    (node) => node.type === NodeType.HTTP_REQUEST,
  );
  const httpVariableName =
    firstHttpNode && typeof firstHttpNode.data.variableName === "string"
      ? firstHttpNode.data.variableName
      : "";
  const defaultMessage =
    operation === "send_message"
      ? "Workflow notification from Flowforge."
      : "Attachment from workflow.";

  const telegramNodeToAppend: AiWorkflowPlan["nodes"][number] = {
    id: newTelegramNodeId,
    type: NodeType.TELEGRAM,
    title: "Telegram",
    description: "Send updates to Telegram",
    data: {
      variableName: "telegramAlert",
      credentialId: "",
      chatId: "",
      operation,
      message: defaultMessage,
      parseMode: "plain",
      disableNotification: false,
      photoSource:
        operation === "send_photo" && httpVariableName
          ? "previous_node"
          : "url",
      documentSource:
        operation === "send_document" && httpVariableName
          ? "previous_node"
          : "url",
      photoBinaryTemplate:
        operation === "send_photo" && httpVariableName
          ? `{{json ${httpVariableName}.httpResponse.data}}`
          : "",
      documentBinaryTemplate:
        operation === "send_document" && httpVariableName
          ? `{{json ${httpVariableName}.httpResponse.data}}`
          : "",
      photoUrl: "",
      documentUrl: "",
    },
  };

  const nextConnections = lastNode
    ? [
        ...plan.connections,
        {
          from: lastNode.id,
          to: newTelegramNodeId,
          fromOutput: "source-1",
          toInput: "target-1",
        },
      ]
    : plan.connections;

  return {
    ...plan,
    nodes: [...plan.nodes, telegramNodeToAppend],
    connections: nextConnections,
    plannerNotes: [
      ...plan.plannerNotes,
      "Telegram intent detected: appended TELEGRAM node as delivery target.",
    ],
  };
}

/**
 * Detect when data transformation is needed and suggest hints
 * Returns suggestions for AI to include transformer nodes
 */
function detectTransformationNeeds(
  nodes: AiWorkflowPlan["nodes"],
  prompt: string,
): string[] {
  const hints: string[] = [];
  const hasHttpNode = nodes.some((n) => n.type === NodeType.HTTP_REQUEST);
  const hasDiscord = nodes.some((n) => n.type === NodeType.DISCORD);
  const hasEmail = nodes.some((n) => n.type === NodeType.EMAIL);
  const hasSheets = nodes.some((n) => n.type === NodeType.GOOGLE_SHEETS);
  const hasTelegram = nodes.some((n) => n.type === NodeType.TELEGRAM);

  const promptLower = prompt.toLowerCase();

  // Detect filtering/ranking needs
  if (
    (promptLower.includes("top ") ||
      promptLower.includes("best ") ||
      promptLower.includes("filter") ||
      promptLower.includes("select") ||
      promptLower.includes("pick")) &&
    hasHttpNode
  ) {
    hints.push(
      "TRANSFORMATION_HINT: User wants to filter/select from API results. Use AI node to pick top items.",
    );
    hints.push(
      "Example: Add OPENAI/GEMINI node with userPrompt='Extract top 10 {{results}} and format for {{nextNode}}'",
    );
  }

  // Detect formatting needs for Discord
  if (
    (promptLower.includes("send") ||
      promptLower.includes("post") ||
      promptLower.includes("notify")) &&
    hasDiscord &&
    hasHttpNode
  ) {
    hints.push(
      "TRANSFORMATION_HINT: HTTP results need formatting for Discord. Add AI node to format data as readable message.",
    );
    hints.push(
      "Discord expects: { content: 'formatted message text' }. Use AI to transform {{apiResult}} into this format.",
    );
  }

  // Detect formatting needs for Email
  if (
    (promptLower.includes("email") ||
      promptLower.includes("mail") ||
      promptLower.includes("send")) &&
    hasEmail &&
    hasHttpNode
  ) {
    hints.push(
      "TRANSFORMATION_HINT: Email body needs formatted content from API. Consider AI node to format {{apiData}} into readable email.",
    );
  }

  // Detect formatting needs for Telegram
  if (
    (promptLower.includes("telegram") ||
      promptLower.includes("tg") ||
      promptLower.includes("notify")) &&
    hasTelegram &&
    hasHttpNode
  ) {
    hints.push(
      "TRANSFORMATION_HINT: Telegram delivery needs concise formatting. Add AI node to transform API data before TELEGRAM node.",
    );
  }

  // Detect Google Sheets mapping
  if (
    (promptLower.includes("sheet") || promptLower.includes("spreadsheet")) &&
    hasSheets &&
    hasHttpNode
  ) {
    hints.push(
      "TRANSFORMATION_HINT: API data needs mapping to sheet columns. Use AI node to extract fields like name, email, date from {{apiResult}}.",
    );
  }

  // Detect summarization/extraction
  if (
    (promptLower.includes("summarize") ||
      promptLower.includes("extract") ||
      promptLower.includes("pull")) &&
    hasHttpNode
  ) {
    hints.push(
      "TRANSFORMATION_HINT: API returns large data. Add AI node to extract key fields and summarize.",
    );
  }

  return hints;
}

function applyPositions(plan: AiWorkflowPlan) {
  const positionedNodes = plan.nodes.map((node, index) => ({
    ...node,
    position: node.position ?? {
      x: 160 + index * 280,
      y: triggerTypes.has(node.type) ? 120 : 260,
    },
  }));

  return {
    ...plan,
    nodes: positionedNodes,
  };
}

/**
 * Build enhanced setup steps based on detected APIs
 */
function buildEnhancedSetupSteps(
  nodes: AiWorkflowPlan["nodes"],
  prompt: string,
): string[] {
  const steps: string[] = [];
  const hasHttpNode = nodes.some((n) => n.type === NodeType.HTTP_REQUEST);
  const hasLinkedIn =
    prompt.toLowerCase().includes("linkedin") ||
    (hasHttpNode &&
      nodes
        .find((n) => n.type === NodeType.HTTP_REQUEST)
        ?.data?.endpoint?.includes("linkedin"));
  const hasDiscord = nodes.some((n) => n.type === NodeType.DISCORD);
  const hasEmail = nodes.some((n) => n.type === NodeType.EMAIL);
  const hasAi = nodes.some(
    (n) =>
      n.type === NodeType.OPENAI ||
      n.type === NodeType.GEMINI ||
      n.type === NodeType.ANTHROPIC,
  );
  const hasSheets = nodes.some((n) => n.type === NodeType.GOOGLE_SHEETS);
  const hasSlack = nodes.some((n) => n.type === NodeType.SLACK);
  const hasTelegram = nodes.some((n) => n.type === NodeType.TELEGRAM);

  let stepNum = 1;

  if (hasLinkedIn) {
    steps.push(
      `Step ${stepNum}: Get LinkedIn API Access (⏱️ 2-3 days approval time)`,
      "→ Visit https://www.linkedin.com/developers",
      "→ Create an app in Developer Portal",
      "→ Request 'Jobs API' access in 'Requested access'",
      "→ LinkedIn will review your request (2-3 business days)",
      "→ Once approved, copy your Client ID and Client Secret",
      "→ In Flowforge: Create new credential of type 'LINKEDIN_API'",
      "→ Paste your credentials and save",
    );
    stepNum++;
  }

  if (hasDiscord) {
    steps.push(
      `Step ${stepNum}: Generate Discord Webhook`,
      "→ Open your Discord server",
      "→ Go to Server Settings → Integrations → Webhooks",
      "→ Click 'New Webhook' button",
      "→ Name it (e.g., 'Flowforge Bot')",
      "→ Select the channel where messages should appear",
      "→ Click 'Copy Webhook URL' button",
      "→ In Flowforge Discord node: Paste URL in 'Webhook URL' field",
      "→ Test by sending a message",
    );
    stepNum++;
  }

  if (hasEmail) {
    steps.push(
      `Step ${stepNum}: Setup Email Credentials`,
      "→ If using Gmail:",
      "  • Enable 2-Factor Authentication first",
      "  • Go to Google Account → Security",
      "  • Scroll to 'App passwords' (appears only if 2FA enabled)",
      "  • Create app password for 'Mail' → 'Windows Computer'",
      "  • Copy the 16-character password",
      "→ If using Outlook/Office 365: Use your email + password directly",
      "→ In Flowforge: Create SMTP credential with your email and app password",
    );
    stepNum++;
  }

  if (hasSheets) {
    steps.push(
      `Step ${stepNum}: Setup Google Sheets Access`,
      "→ Create a new Google Sheet or use existing",
      "→ Go to Google Cloud Console (console.cloud.google.com)",
      "→ Create a new project (name: 'Flowforge')",
      "→ Enable 'Google Sheets API'",
      "→ Create Service Account (APIs & Services → Credentials)",
      "→ Download the JSON key file",
      "→ Share your Sheet with the service account email",
      "→ In Flowforge: Upload the JSON key as credential",
    );
    stepNum++;
  }

  if (hasSlack) {
    steps.push(
      `Step ${stepNum}: Setup Slack Integration`,
      "→ Go to https://api.slack.com/apps",
      "→ Create 'New App' → From scratch",
      "→ Add permissions: 'chat:write', 'files:write'",
      "→ Install app to your workspace",
      "→ Copy 'Bot User OAuth Token' (starts with xoxb-)",
      "→ In Flowforge: Create SLACK credential and paste token",
    );
    stepNum++;
  }

  if (hasTelegram) {
    steps.push(
      `Step ${stepNum}: Setup Telegram Bot`,
      "→ Open Telegram and start @BotFather",
      "→ Run /newbot and create your bot",
      "→ Copy bot token from BotFather",
      "→ Send at least one message to your bot from target chat/channel",
      "→ Get chat ID (user/group/channel) and set it in Telegram node",
      "→ In Flowforge: Create TELEGRAM_BOT credential with bot token",
      "→ Use 'Test Message' in Telegram node to verify configuration",
    );
    stepNum++;
  }

  if (hasAi) {
    steps.push(
      `Step ${stepNum}: Verify AI Model Credentials`,
      "→ For OpenAI: Add your API key from https://platform.openai.com",
      "→ For Gemini: Add API key from Google AI Studio",
      "→ For Claude: Add API key from Anthropic console",
      "→ One provider is required for AI transformation nodes",
    );
    stepNum++;
  }

  steps.push(
    "",
    "✅ FINAL CHECKLIST:",
    "→ All credential fields are filled (no red asterisks)",
    "→ Click 'Validate Workflow' to check for missing fields",
    "→ Click 'Run Test' to execute the workflow once",
    "→ Check execution logs for any errors",
    "→ If test passes, enable workflow and let it run on schedule",
    "",
    "❓ Need help? Check setup logs in workflow execution history",
  );

  return steps;
}

function attachCredentialDefaults(
  plan: AiWorkflowPlan,
  credentialsByType: Record<CredentialType, UserCredentialSummary[]>,
) {
  const nodes = plan.nodes.map((node) => {
    const credentialType = credentialRequiredByNodeType[node.type];
    if (!credentialType) {
      return node;
    }

    const suggestedCredential = credentialsByType[credentialType]?.[0];
    if (!suggestedCredential) {
      return node;
    }

    return {
      ...node,
      data: {
        ...node.data,
        credentialId:
          typeof node.data.credentialId === "string" && node.data.credentialId
            ? node.data.credentialId
            : suggestedCredential.id,
      },
    };
  });

  return {
    ...plan,
    nodes,
  };
}

function buildRequiredCredentials(
  nodes: AiWorkflowPlan["nodes"],
  credentialsByType: Record<CredentialType, UserCredentialSummary[]>,
) {
  const byType = new Map<
    CredentialType,
    {
      nodeIds: string[];
    }
  >();

  for (const node of nodes) {
    const credentialType = credentialRequiredByNodeType[node.type];
    if (!credentialType) {
      continue;
    }

    const current = byType.get(credentialType) ?? { nodeIds: [] };
    current.nodeIds.push(node.id);
    byType.set(credentialType, current);
  }

  const guidanceText: Record<CredentialType, string> = {
    [CredentialType.OPENAI]:
      "Create an OpenAI credential and pick it in AI nodes.",
    [CredentialType.GEMINI]:
      "Create a Gemini credential and pick it in AI nodes.",
    [CredentialType.ANTHROPIC]:
      "Create an Anthropic credential and pick it in AI nodes.",
    [CredentialType.SMTP]:
      "Create SMTP credential (Gmail/Outlook/Custom) and select it in Email node.",
    [CredentialType.GOOGLE_SHEETS]:
      "Create Google Sheets credential (Service Account or OAuth) and select it in Google Sheets node.",
    [CredentialType.TELEGRAM_BOT]:
      "Create a Telegram Bot credential with your bot token and select it in Telegram node.",
  };

  return [...byType.entries()].map(([type, value]) => {
    const suggested = credentialsByType[type]?.[0];
    return {
      type,
      displayName: type,
      nodeIds: value.nodeIds,
      configured: Boolean(suggested),
      suggestedCredentialId: suggested?.id,
      guidance: guidanceText[type],
    };
  });
}

function computeMissingInputs(plan: AiWorkflowPlan) {
  const questions: AiWorkflowPlan["missingInputs"] = [...plan.missingInputs];
  const tracked = new Set(
    questions.map((item) => `${item.nodeId}:${item.field}`),
  );

  const push = (entry: AiWorkflowPlan["missingInputs"][number]) => {
    const key = `${entry.nodeId}:${entry.field}`;
    if (tracked.has(key)) {
      return;
    }
    tracked.add(key);
    questions.push(entry);
  };

  for (const node of plan.nodes) {
    if (node.type === NodeType.EMAIL) {
      if (!String(node.data.toEmail ?? "").trim()) {
        push({
          nodeId: node.id,
          field: "toEmail",
          question: "What email recipient should this workflow send to?",
          whyItMatters: "Email node cannot send without recipients.",
          example: "alerts@company.com",
        });
      }
    }

    if (
      node.type === NodeType.DISCORD &&
      !String(node.data.webhookUrl ?? "").trim()
    ) {
      push({
        nodeId: node.id,
        field: "webhookUrl",
        question: "What Discord webhook URL should be used?",
        whyItMatters:
          "Discord node needs webhook endpoint to deliver messages.",
        example: "https://discord.com/api/webhooks/...",
      });
    }

    if (
      node.type === NodeType.SLACK &&
      !String(node.data.webhookUrl ?? "").trim()
    ) {
      push({
        nodeId: node.id,
        field: "webhookUrl",
        question: "What Slack webhook URL should be used?",
        whyItMatters: "Slack node needs webhook endpoint to deliver messages.",
        example: "https://hooks.slack.com/services/...",
      });
    }

    if (
      node.type === NodeType.HTTP_REQUEST &&
      !String(node.data.endpoint ?? "").trim()
    ) {
      push({
        nodeId: node.id,
        field: "endpoint",
        question: "Which API endpoint or URL should be requested?",
        whyItMatters: "HTTP Request node cannot run without endpoint.",
      });
    }

    if (
      node.type === NodeType.GOOGLE_SHEETS &&
      !String(node.data.spreadsheetId ?? "").trim()
    ) {
      push({
        nodeId: node.id,
        field: "spreadsheetId",
        question: "Which Google Spreadsheet should be used?",
        whyItMatters: "Google Sheets node requires target spreadsheet.",
      });
    }

    if (
      node.type === NodeType.TELEGRAM &&
      !String(node.data.chatId ?? "").trim()
    ) {
      push({
        nodeId: node.id,
        field: "chatId",
        question: "Which Telegram chat ID or @channel username should be used?",
        whyItMatters:
          "Telegram node cannot deliver messages without a valid target chat.",
        example: "-1001234567890 or @my_channel",
      });
    }

    if (
      node.type === NodeType.TELEGRAM &&
      String(node.data.operation ?? "send_message") === "send_message" &&
      !String(node.data.message ?? "").trim()
    ) {
      push({
        nodeId: node.id,
        field: "message",
        question: "What message should Telegram send?",
        whyItMatters: "send_message operation requires non-empty text.",
        example: "New form response received: {{googleForm.responses.Name}}",
      });
    }
  }

  return questions;
}

function buildFallbackPlan(params: {
  prompt: string;
  mode: AiBuilderMode;
  credentialsByType: Record<CredentialType, UserCredentialSummary[]>;
  plannerFailureReason?: string;
}): AiWorkflowPlan {
  const normalizedPrompt = params.prompt.toLowerCase();
  const nodes: AiWorkflowPlan["nodes"] = [];
  const plannerNotes: string[] = ["Used fallback deterministic planner."];

  if (params.plannerFailureReason) {
    plannerNotes.push(`Reason: ${params.plannerFailureReason}`);
  }

  let nodeIndex = 1;
  const makeId = (prefix: string) => `${prefix}_${nodeIndex++}`;
  const pushNode = (node: AiWorkflowPlan["nodes"][number]) => {
    nodes.push(node);
    return node;
  };

  // Determine trigger
  const triggerType = normalizedPrompt.includes("form")
    ? NodeType.GOOGLE_FORM_TRIGGER
    : normalizedPrompt.includes("stripe") ||
        normalizedPrompt.includes("payment")
      ? NodeType.STRIPE_TRIGGER
      : NodeType.MANUAL_TRIGGER;

  pushNode({
    id: makeId("trigger"),
    type: triggerType,
    title: getNodeTitle(triggerType),
    description: "Workflow trigger",
    data: {},
  });

  // Add HTTP if it's a data-fetching workflow
  if (
    normalizedPrompt.includes("scrape") ||
    normalizedPrompt.includes("fetch") ||
    normalizedPrompt.includes("api") ||
    normalizedPrompt.includes("search") ||
    normalizedPrompt.includes("job")
  ) {
    pushNode({
      id: makeId("http"),
      type: NodeType.HTTP_REQUEST,
      title: "HTTP Request",
      description: "Fetch data from API or website",
      data: {
        variableName: "data",
        endpoint: "",
        method: "GET",
        body: "",
      },
    });
  }

  // Add AI transformation if requested
  if (
    normalizedPrompt.includes("summarize") ||
    normalizedPrompt.includes("transform") ||
    normalizedPrompt.includes("ai") ||
    normalizedPrompt.includes("filter") ||
    normalizedPrompt.includes("extract")
  ) {
    const aiType =
      params.credentialsByType[CredentialType.GEMINI].length > 0
        ? NodeType.GEMINI
        : params.credentialsByType[CredentialType.OPENAI].length > 0
          ? NodeType.OPENAI
          : NodeType.ANTHROPIC;

    pushNode({
      id: makeId("ai"),
      type: aiType,
      title: getNodeTitle(aiType),
      description: "Process and transform data",
      data: {
        variableName: "result",
        credentialId: "",
        systemPrompt:
          "You are a helpful assistant that processes workflow data.",
        userPrompt:
          "Process this data and provide the required output in a concise format.",
      },
    });
  }

  // Add output node
  if (
    normalizedPrompt.includes("email") ||
    normalizedPrompt.includes("send email") ||
    normalizedPrompt.includes("mail")
  ) {
    pushNode({
      id: makeId("email"),
      type: NodeType.EMAIL,
      title: "Email",
      description: "Send result via email",
      data: {
        provider: "gmail",
        credentialId: "",
        fromEmail: "",
        toEmail: "",
        subject: "Workflow Update",
        messageBody: "{{result.text}}",
        htmlMode: false,
      },
    });
  } else if (normalizedPrompt.includes("discord")) {
    pushNode({
      id: makeId("discord"),
      type: NodeType.DISCORD,
      title: "Discord",
      description: "Send message to Discord",
      data: {
        variableName: "discordMsg",
        webhookUrl: "",
        content: "{{result.text}}",
        username: "Flowforge",
      },
    });
  } else if (normalizedPrompt.includes("slack")) {
    pushNode({
      id: makeId("slack"),
      type: NodeType.SLACK,
      title: "Slack",
      description: "Send message to Slack",
      data: {
        variableName: "slackMsg",
        webhookUrl: "",
        content: "{{result.text}}",
        username: "Flowforge",
      },
    });
  } else if (hasTelegramIntent(normalizedPrompt)) {
    const telegramOperation = getTelegramOperationFromPrompt(normalizedPrompt);
    const hasAiNode = nodes.some(
      (n) =>
        n.type === NodeType.OPENAI ||
        n.type === NodeType.GEMINI ||
        n.type === NodeType.ANTHROPIC,
    );
    const firstHttpNode = nodes.find((n) => n.type === NodeType.HTTP_REQUEST);
    const httpVariableName =
      firstHttpNode && typeof firstHttpNode.data.variableName === "string"
        ? firstHttpNode.data.variableName
        : "";
    pushNode({
      id: makeId("telegram"),
      type: NodeType.TELEGRAM,
      title: "Telegram",
      description: "Send result to Telegram",
      data: {
        variableName: "telegramAlert",
        credentialId: "",
        chatId: "",
        operation: telegramOperation,
        message:
          telegramOperation === "send_message"
            ? hasAiNode
              ? "{{result.text}}"
              : httpVariableName
                ? `{{json ${httpVariableName}.httpResponse.data}}`
                : "Workflow notification"
            : "Workflow attachment",
        parseMode: "plain",
        disableNotification: false,
        photoSource:
          telegramOperation === "send_photo" && httpVariableName
            ? "previous_node"
            : "url",
        documentSource:
          telegramOperation === "send_document" && httpVariableName
            ? "previous_node"
            : "url",
        photoBinaryTemplate:
          telegramOperation === "send_photo" && httpVariableName
            ? `{{json ${httpVariableName}.httpResponse.data}}`
            : "",
        documentBinaryTemplate:
          telegramOperation === "send_document" && httpVariableName
            ? `{{json ${httpVariableName}.httpResponse.data}}`
            : "",
        photoUrl: "",
        documentUrl: "",
      },
    });
  } else if (
    normalizedPrompt.includes("sheet") ||
    normalizedPrompt.includes("spreadsheet")
  ) {
    pushNode({
      id: makeId("sheets"),
      type: NodeType.GOOGLE_SHEETS,
      title: "Google Sheets",
      description: "Append results to spreadsheet",
      data: {
        credentialId: "",
        spreadsheetId: "",
        sheetName: "Sheet1",
        operation: "append_row",
        range: "A:ZZ",
        columnMappingJson: "{}",
        useFirstRowAsHeaders: true,
      },
    });
  } else if (nodes.length === 1) {
    // Default to HTTP if no output specified
    pushNode({
      id: makeId("http"),
      type: NodeType.HTTP_REQUEST,
      title: "HTTP Request",
      description: "Default action",
      data: {
        variableName: "data",
        endpoint: "",
        method: "GET",
        body: "",
        headersJson: "{}",
      },
    });
  }

  // Build connections
  const connections: AiWorkflowPlan["connections"] = nodes
    .slice(0, -1)
    .map((node, index) => ({
      from: node.id,
      to: nodes[index + 1]?.id ?? node.id,
      fromOutput: "source-1",
      toInput: "target-1",
    }));

  return {
    workflowName: "AI Generated Workflow",
    summary: "Workflow created using fallback planner",
    explanation:
      "This workflow was generated with deterministic mapping. Please review all fields before executing.",
    nodes,
    connections,
    requiredCredentials: [],
    missingInputs: [],
    userNextSteps: buildEnhancedSetupSteps(nodes, params.prompt),
    unsupportedRequests: [],
    plannerNotes,
  };
}

export async function generateAiWorkflowPlan(params: {
  userId: string;
  prompt: string;
  mode: AiBuilderMode;
  history: AiBuilderMessage[];
  currentNodes: AiWorkflowBuilderInput["currentNodes"];
  currentEdges: AiWorkflowBuilderInput["currentEdges"];
  preferredProvider?: "openai" | "gemini" | "anthropic";
}): Promise<AiWorkflowPlan> {
  const userCredentials = await prisma.credential.findMany({
    where: { userId: params.userId },
    select: { id: true, name: true, type: true },
    orderBy: { updatedAt: "desc" },
  });

  const credentialsByType = userCredentials.reduce(
    (acc, credential) => {
      acc[credential.type].push(credential);
      return acc;
    },
    {
      [CredentialType.OPENAI]: [],
      [CredentialType.GEMINI]: [],
      [CredentialType.ANTHROPIC]: [],
      [CredentialType.SMTP]: [],
      [CredentialType.GOOGLE_SHEETS]: [],
      [CredentialType.TELEGRAM_BOT]: [],
    } as Record<CredentialType, UserCredentialSummary[]>,
  );

  let withDefaults: AiWorkflowPlan;

  try {
    const plannerModel = await selectPlannerModel(
      params.userId,
      params.preferredProvider,
    );
    const prompt = buildPlannerPrompt({
      mode: params.mode,
      prompt: params.prompt,
      history: params.history,
      credentialsByType,
      currentNodes: params.currentNodes,
      currentEdges: params.currentEdges,
    });

    const { object } = await generateObject({
      model: plannerModel.model,
      schema: aiWorkflowPlanSchema,
      prompt,
      temperature: 0.2,
    });

    withDefaults = {
      ...object,
      nodes: object.nodes.map((node) => ensureNodeDefaults(node)),
      plannerNotes: [
        ...object.plannerNotes,
        `Planner model: ${plannerModel.provider}`,
      ],
    };
  } catch (error) {
    withDefaults = buildFallbackPlan({
      prompt: params.prompt,
      mode: params.mode,
      credentialsByType,
      plannerFailureReason:
        error instanceof Error ? error.message : "Unknown planner failure",
    });
  }

  const withTelegramPriority = enforceTelegramPriority(
    withDefaults,
    params.prompt,
  );
  const withTrigger = ensureSingleTrigger(withTelegramPriority);
  const withUniqueIds = ensureUniqueNodeIds(withTrigger);
  const withConnections = ensureConnections(withUniqueIds);
  const withPositions = applyPositions(withConnections);
  const withCredentials = attachCredentialDefaults(
    withPositions,
    credentialsByType,
  );
  const requiredCredentials = buildRequiredCredentials(
    withCredentials.nodes,
    credentialsByType,
  );
  const missingInputs = computeMissingInputs(withCredentials);

  // VALIDATE before returning
  const validator = new WorkflowValidator(
    withCredentials.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      description: n.description,
      data: n.data,
    })),
    withCredentials.connections,
  );

  const validationResult = validator.validate();
  const validationNotes = validationResult.errors
    .filter((e) => e.severity === "error")
    .map((e) => `ERROR: ${e.message}`);

  const enhancedSetupSteps = buildEnhancedSetupSteps(
    withCredentials.nodes,
    params.prompt,
  );

  return {
    ...withCredentials,
    requiredCredentials,
    missingInputs,
    userNextSteps: [
      ...enhancedSetupSteps,
      "",
      "After setup:",
      "• Apply workflow to canvas",
      "• Save and run test execution",
      "• Enable workflow when ready",
    ],
    plannerNotes: [...withCredentials.plannerNotes, ...validationNotes],
  };
}
