import z from "zod";
import { NodeType } from "@/generated/prisma";

/**
 * Node IO Schema System
 * 
 * Defines what each node type requires as input and what it outputs.
 * This is used by:
 * 1. AI Planner - understand node compatibility
 * 2. Validator - ensure connections are valid
 * 3. Template Engine - substitute variables correctly
 */

// ============================================================================
// INPUT SCHEMAS - What each node requires
// ============================================================================

export const nodeInputSchemas: Record<NodeType, z.ZodSchema> = {
  [NodeType.INITIAL]: z.object({}).strict(),
  
  [NodeType.MANUAL_TRIGGER]: z.object({}).strict(),

  [NodeType.GOOGLE_FORM_TRIGGER]: z.object({
    formId: z.string().optional(),
    watchMode: z.string().optional(),
  }).strict(),

  [NodeType.STRIPE_TRIGGER]: z.object({
    eventType: z.string().optional(),
    endpointSecret: z.string().optional(),
  }).strict(),

  [NodeType.HTTP_REQUEST]: z.object({
    variableName: z.string().min(1),
    endpoint: z.string().min(1),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    body: z.string().optional(),
    headersJson: z.string().optional(),
  }).strict(),

  [NodeType.EMAIL]: z.object({
    provider: z.string(),
    credentialId: z.string().min(1),
    fromEmail: z.string().email(),
    toEmail: z.string().min(1),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    subject: z.string().min(1),
    messageBody: z.string().min(1),
    htmlMode: z.boolean().optional(),
    attachmentsJson: z.string().optional(),
    customHost: z.string().optional(),
    customPort: z.number().optional(),
    customSecure: z.boolean().optional(),
  }).strict(),

  [NodeType.DISCORD]: z.object({
    variableName: z.string().min(1),
    webhookUrl: z.string().url(),
    content: z.string().min(1),
    username: z.string().optional(),
  }).strict(),

  [NodeType.SLACK]: z.object({
    variableName: z.string().min(1),
    webhookUrl: z.string().url(),
    content: z.string().min(1),
    username: z.string().optional(),
  }).strict(),

  [NodeType.GOOGLE_SHEETS]: z.object({
    credentialId: z.string().min(1),
    spreadsheetId: z.string().min(1),
    sheetName: z.string().min(1),
    operation: z.enum(["append_row", "update_row", "find_rows", "delete_rows", "create_sheet"]),
    range: z.string(),
    columnMappingJson: z.string().optional(),
    limitRows: z.number().optional(),
    useFirstRowAsHeaders: z.boolean().optional(),
    matchColumn: z.string().optional(),
    matchValue: z.string().optional(),
  }).strict(),

  [NodeType.OPENAI]: z.object({
    variableName: z.string().min(1),
    credentialId: z.string().min(1),
    systemPrompt: z.string(),
    userPrompt: z.string().min(1),
  }).strict(),

  [NodeType.GEMINI]: z.object({
    variableName: z.string().min(1),
    credentialId: z.string().min(1),
    systemPrompt: z.string(),
    userPrompt: z.string().min(1),
  }).strict(),

  [NodeType.ANTHROPIC]: z.object({
    variableName: z.string().min(1),
    credentialId: z.string().min(1),
    systemPrompt: z.string(),
    userPrompt: z.string().min(1),
  }).strict(),
};

// ============================================================================
// OUTPUT SCHEMAS - What each node outputs to context
// ============================================================================

export type NodeOutput = {
  variableName: string;
  structure: string; // Describes the output structure for template substitution
  example: Record<string, unknown>;
};

export const nodeOutputSchemas: Record<NodeType, NodeOutput> = {
  [NodeType.INITIAL]: {
    variableName: "initial",
    structure: '{}',
    example: {},
  },

  [NodeType.MANUAL_TRIGGER]: {
    variableName: "trigger",
    structure: '{ "timestamp": ISO8601, "userId": string }',
    example: { timestamp: "2024-01-01T00:00:00Z", userId: "user123" },
  },

  [NodeType.GOOGLE_FORM_TRIGGER]: {
    variableName: "formResponse",
    structure: '{ "responses": Record<string, string>, "timestamp": ISO8601 }',
    example: { responses: { field1: "value1" }, timestamp: "2024-01-01T00:00:00Z" },
  },

  [NodeType.STRIPE_TRIGGER]: {
    variableName: "stripeEvent",
    structure: '{ "type": string, "data": object, "id": string }',
    example: { type: "charge.succeeded", data: {}, id: "evt_123" },
  },

  [NodeType.HTTP_REQUEST]: {
    variableName: "", // Uses configurable variableName (e.g., "httpRequest", "jobs")
    structure: '{ "httpResponse": { "status": number, "statusText": string, "data": unknown } }',
    example: {
      httpResponse: { status: 200, statusText: "OK", data: { jobs: [] } },
    },
  },

  [NodeType.EMAIL]: {
    variableName: "emailResult",
    structure: '{ "success": boolean, "messageId": string }',
    example: { success: true, messageId: "msg_123" },
  },

  [NodeType.DISCORD]: {
    variableName: "discordResult",
    structure: '{ "messageContent": string }',
    example: { messageContent: "Message sent" },
  },

  [NodeType.SLACK]: {
    variableName: "slackResult",
    structure: '{ "messageContent": string }',
    example: { messageContent: "Message sent" },
  },

  [NodeType.GOOGLE_SHEETS]: {
    variableName: "sheetsResult",
    structure: '{ "success": boolean, "rows": unknown[] }',
    example: { success: true, rows: [] },
  },

  [NodeType.OPENAI]: {
    variableName: "", // Uses configurable variableName (e.g., "aiSummary", "classification")
    structure: '{ "text": string, "usage": { "inputTokens": number, "outputTokens": number } }',
    example: { text: "AI generated text", usage: { inputTokens: 100, outputTokens: 50 } },
  },

  [NodeType.GEMINI]: {
    variableName: "",
    structure: '{ "text": string, "usage": { "inputTokens": number, "outputTokens": number } }',
    example: { text: "AI generated text", usage: { inputTokens: 100, outputTokens: 50 } },
  },

  [NodeType.ANTHROPIC]: {
    variableName: "",
    structure: '{ "text": string, "usage": { "inputTokens": number, "outputTokens": number } }',
    example: { text: "AI generated text", usage: { inputTokens: 100, outputTokens: 50 } },
  },
};

// ============================================================================
// VARIABLE REGISTRY - Maps variable references to node outputs
// ============================================================================

/**
 * When a node references {{jobsList}}, the registry helps find:
 * 1. Which node in the workflow produces jobsList
 * 2. What structure that node outputs
 * 3. Whether the reference is valid
 */
export interface VariableRegistry {
  [variableKey: string]: {
    nodeId: string;
    nodeType: NodeType;
    path: string; // e.g., "httpRequest.httpResponse.data" or "aiResult.text"
    type: "trigger" | "output" | "context";
  };
}

/**
 * Build variable registry from workflow nodes
 */
export function buildVariableRegistry(
  nodes: Array<{ id: string; type: NodeType; data: Record<string, unknown> }>
): VariableRegistry {
  const registry: VariableRegistry = {};

  for (const node of nodes) {
    const schema = nodeOutputSchemas[node.type];
    if (!schema) continue;

    // Configurable variable name (HTTP_REQUEST, AI nodes use node.data.variableName)
    if (!schema.variableName && node.data.variableName) {
      const varName = String(node.data.variableName);
      registry[varName] = {
        nodeId: node.id,
        nodeType: node.type,
        path: `${varName}`,
        type: "output",
      };
    } else if (schema.variableName) {
      registry[schema.variableName] = {
        nodeId: node.id,
        nodeType: node.type,
        path: schema.variableName,
        type: "output",
      };
    }
  }

  return registry;
}

/**
 * Validate that a template variable reference exists in registry
 */
export function validateTemplateVariable(
  template: string | undefined,
  registry: VariableRegistry
): { valid: boolean; missingVariables: string[] } {
  if (!template) return { valid: true, missingVariables: [] };

  // Extract {{variable}} and {{variable.path}} references
  const variableRegex = /\{\{(\w+)/g;
  const missingVariables: string[] = [];

  let match;
  while ((match = variableRegex.exec(template)) !== null) {
    const varKey = match[1];
    if (!registry[varKey]) {
      missingVariables.push(varKey);
    }
  }

  return {
    valid: missingVariables.length === 0,
    missingVariables: [...new Set(missingVariables)],
  };
}

// ============================================================================
// NODE REQUIREMENTS - What's needed to execute
// ============================================================================

export interface NodeRequirement {
  field: string;
  required: boolean;
  type: "string" | "url" | "email" | "number" | "json" | "enum";
  canUseTemplate: boolean;
  examples?: string[];
}

export const nodeRequirements: Record<NodeType, NodeRequirement[]> = {
  [NodeType.INITIAL]: [],

  [NodeType.MANUAL_TRIGGER]: [],

  [NodeType.GOOGLE_FORM_TRIGGER]: [
    { field: "formId", required: true, type: "string", canUseTemplate: false },
  ],

  [NodeType.STRIPE_TRIGGER]: [
    { field: "eventType", required: true, type: "enum", canUseTemplate: false },
    { field: "endpointSecret", required: true, type: "string", canUseTemplate: false },
  ],

  [NodeType.HTTP_REQUEST]: [
    { field: "variableName", required: true, type: "string", canUseTemplate: false },
    { field: "endpoint", required: true, type: "url", canUseTemplate: true },
    {
      field: "method",
      required: true,
      type: "enum",
      canUseTemplate: false,
      examples: ["GET", "POST", "PUT"],
    },
  ],

  [NodeType.EMAIL]: [
    { field: "credentialId", required: true, type: "string", canUseTemplate: false },
    { field: "toEmail", required: true, type: "email", canUseTemplate: true },
    { field: "subject", required: true, type: "string", canUseTemplate: true },
    { field: "messageBody", required: true, type: "string", canUseTemplate: true },
  ],

  [NodeType.DISCORD]: [
    { field: "webhookUrl", required: true, type: "url", canUseTemplate: false },
    { field: "content", required: true, type: "string", canUseTemplate: true },
    { field: "variableName", required: true, type: "string", canUseTemplate: false },
  ],

  [NodeType.SLACK]: [
    { field: "webhookUrl", required: true, type: "url", canUseTemplate: false },
    { field: "content", required: true, type: "string", canUseTemplate: true },
    { field: "variableName", required: true, type: "string", canUseTemplate: false },
  ],

  [NodeType.GOOGLE_SHEETS]: [
    { field: "credentialId", required: true, type: "string", canUseTemplate: false },
    { field: "spreadsheetId", required: true, type: "string", canUseTemplate: false },
    { field: "sheetName", required: true, type: "string", canUseTemplate: false },
    {
      field: "operation",
      required: true,
      type: "enum",
      canUseTemplate: false,
      examples: ["append_row", "update_row"],
    },
  ],

  [NodeType.OPENAI]: [
    { field: "credentialId", required: true, type: "string", canUseTemplate: false },
    { field: "userPrompt", required: true, type: "string", canUseTemplate: true },
    { field: "variableName", required: true, type: "string", canUseTemplate: false },
  ],

  [NodeType.GEMINI]: [
    { field: "credentialId", required: true, type: "string", canUseTemplate: false },
    { field: "userPrompt", required: true, type: "string", canUseTemplate: true },
    { field: "variableName", required: true, type: "string", canUseTemplate: false },
  ],

  [NodeType.ANTHROPIC]: [
    { field: "credentialId", required: true, type: "string", canUseTemplate: false },
    { field: "userPrompt", required: true, type: "string", canUseTemplate: true },
    { field: "variableName", required: true, type: "string", canUseTemplate: false },
  ],
};

/**
 * API SPECIFICATIONS
 * Defines requirements, auth methods, and best practices for common APIs
 * Used by AI planner to generate correct HTTP node configurations
 */
export const apiSpecifications: Record<
  string,
  {
    name: string;
    endpoints: Record<string, string>;
    authMethod: "bearer" | "apikey" | "basic" | "oauth" | "none";
    authHeaderName?: string;
    authHeaderPrefix?: string;
    requiredHeaders?: Record<string, string>;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    pagination?: {
      type: "offset" | "cursor" | "page" | "none";
      paramName?: string;
      limitParamName?: string;
      defaultLimit?: number;
    };
    rateLimit?: string;
    dataPath?: string;
    description: string;
    setupGuide: string;
  }
> = {
  linkedin_jobs: {
    name: "LinkedIn Jobs API",
    endpoints: {
      search: "https://api.linkedin.com/v2/jobs",
      get: "https://api.linkedin.com/v2/jobs/{id}",
    },
    authMethod: "bearer",
    authHeaderName: "Authorization",
    authHeaderPrefix: "Bearer",
    requiredHeaders: {
      "Content-Type": "application/json",
    },
    method: "GET",
    pagination: {
      type: "offset",
      paramName: "start",
      limitParamName: "count",
      defaultLimit: 10,
    },
    dataPath: "elements",
    description:
      "Search and retrieve job listings from LinkedIn. Returns array of job objects.",
    setupGuide:
      "1. Go to https://www.linkedin.com/developers\n2. Create an app\n3. Request LinkedIn Jobs API access\n4. Get your access token\n5. Add credential with type LINKEDIN_API_KEY",
  },

  discord_webhook: {
    name: "Discord Webhooks",
    endpoints: {
      send: "{webhookUrl}",
    },
    authMethod: "none",
    method: "POST",
    requiredHeaders: {
      "Content-Type": "application/json",
    },
    description:
      "Send messages to Discord channels via webhook. Supports embeds and formatting.",
    setupGuide:
      "1. Open Discord server settings\n2. Go to Integrations → Webhooks\n3. Click 'New Webhook'\n4. Copy webhook URL\n5. Paste in Discord node webhookUrl field",
  },

  google_sheets_api: {
    name: "Google Sheets API",
    endpoints: {
      values: "https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values",
      batch: "https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values:batchUpdate",
    },
    authMethod: "oauth",
    requiredHeaders: {
      "Content-Type": "application/json",
    },
    method: "POST",
    pagination: {
      type: "none",
    },
    description:
      "Read, write, and update Google Sheets. Requires Service Account or OAuth.",
    setupGuide:
      "1. Go to Google Cloud Console\n2. Create a project\n3. Enable Sheets API\n4. Create Service Account\n5. Download JSON key\n6. Add credential in FlowForge",
  },

  smtp_email: {
    name: "SMTP Email",
    endpoints: {
      send: "smtp://{host}:{port}",
    },
    authMethod: "basic",
    method: "POST",
    description:
      "Send emails via SMTP (Gmail, Outlook, custom servers). Requires email and password.",
    setupGuide:
      "Gmail: 1. Enable 2FA\n2. Generate App Password\n3. Use app@gmail.com and app password\n\nOutlook: Use your email and password directly",
  },

  slack_webhook: {
    name: "Slack Webhooks",
    endpoints: {
      send: "{webhookUrl}",
    },
    authMethod: "none",
    method: "POST",
    requiredHeaders: {
      "Content-Type": "application/json",
    },
    description:
      "Send messages to Slack channels via webhook. Supports formatting and attachments.",
    setupGuide:
      "1. Go to Slack API\n2. Create an app\n3. Enable Incoming Webhooks\n4. Create webhook for channel\n5. Copy webhook URL",
  },
};

/**
 * API REQUIREMENTS GUIDE
 * Shows what credentials, fields, and setup each common task needs
 */
export const apiRequirementsGuide: Record<
  string,
  {
    task: string;
    requiredApis: string[];
    requiredCredentials: string[];
    setupSteps: string[];
    commonErrors: Array<{ error: string; solution: string }>;
  }
> = {
  "scrape-linkedin-jobs": {
    task: "Scrape LinkedIn jobs and send to Discord",
    requiredApis: ["linkedin_jobs", "discord_webhook"],
    requiredCredentials: ["LINKEDIN_API_KEY", "DISCORD_WEBHOOK"],
    setupSteps: [
      "Get LinkedIn API access (may take 2-3 days for approval)",
      "Create Discord server and webhook",
      "Add LinkedIn credential with API token",
      "Set Discord webhook URL",
      "Optionally add AI node to format/filter results",
      "Test with manual trigger first",
    ],
    commonErrors: [
      {
        error: "401 Unauthorized from LinkedIn",
        solution:
          "Ensure API token is valid and has jobs:search scope. Check credential is latest token.",
      },
      {
        error: "Discord webhook returns 404",
        solution: "Webhook URL may have been deleted. Regenerate new webhook in Discord.",
      },
      {
        error: "Empty results sent to Discord",
        solution:
          "Add AI node to transform array → format for human readability. Use JSON path to extract job data.",
      },
    ],
  },

  "email-alerts": {
    task: "Send email alerts when something happens",
    requiredApis: ["smtp_email"],
    requiredCredentials: ["SMTP_CREDENTIAL"],
    setupSteps: [
      "If using Gmail: Enable 2FA, generate App Password",
      "Add SMTP credential (email + password/app-password)",
      "Verify sender email is authorized",
      "Test with single email first",
      "Add additional recipients carefully",
    ],
    commonErrors: [
      {
        error: "550 User not recognized",
        solution: "Check email address spelling and ensure it's registered.",
      },
      {
        error: "535 Authentication failed",
        solution: "For Gmail, use App Password not regular password. For Outlook, verify credentials.",
      },
    ],
  },

  "sheet-logging": {
    task: "Log workflow results to Google Sheets",
    requiredApis: ["google_sheets_api"],
    requiredCredentials: ["GOOGLE_SHEETS_SA"],
    setupSteps: [
      "Create Google Sheet",
      "Create Service Account in Google Cloud",
      "Download JSON key",
      "Add credential in FlowForge",
      "Share sheet with service account email",
      "Set column headers in first row",
      "Map data fields to columns",
    ],
    commonErrors: [
      {
        error: "403 Forbidden",
        solution: "Ensure sheet is shared with service account email address.",
      },
      {
        error: "Invalid column reference",
        solution: "Check column letters match your sheet (A, B, C, etc.)",
      },
    ],
  },
};

