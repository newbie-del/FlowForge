import { NodeType } from "@/generated/prisma";
import {
  buildVariableRegistry,
  nodeOutputSchemas,
  nodeRequirements,
  type VariableRegistry,
  validateTemplateVariable,
} from "./node-schemas";

export interface AiWorkflowNode {
  id: string;
  type: NodeType;
  title: string;
  description?: string;
  data: Record<string, unknown>;
}

export interface AiWorkflowConnection {
  from: string;
  to: string;
  fromOutput: string;
  toInput: string;
}

export interface ValidationError {
  severity: "error" | "warning";
  nodeId?: string;
  field?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Comprehensive validator for AI-generated workflows
 * Checks all aspects before execution to catch issues early
 */
export class WorkflowValidator {
  private nodes: AiWorkflowNode[];
  private connections: AiWorkflowConnection[];
  private errors: ValidationError[] = [];
  private nodeMap: Map<string, AiWorkflowNode>;
  private variableRegistry: VariableRegistry;

  constructor(nodes: AiWorkflowNode[], connections: AiWorkflowConnection[]) {
    this.nodes = nodes;
    this.connections = connections;
    this.nodeMap = new Map(nodes.map((n) => [n.id, n]));
    this.variableRegistry = buildVariableRegistry(nodes);
  }

  /**
   * Run full validation suite
   */
  validate(): ValidationResult {
    this.errors = [];

    // Phase 1: Basic structure
    this.validateBasicStructure();

    // Phase 2: Individual nodes
    this.validateNodes();

    // Phase 3: Connections
    this.validateConnections();

    // Phase 4: Data flow
    this.validateDataFlow();

    // Phase 5: Credentials
    this.validateCredentials();

    return {
      valid: !this.errors.some((e) => e.severity === "error"),
      errors: this.errors,
    };
  }

  // =========================================================================
  // PHASE 1: Basic Structure Validation
  // =========================================================================

  private validateBasicStructure(): void {
    // At least one trigger
    const hasTrigger = this.nodes.some((n) => this.isTriggerType(n.type));
    if (!hasTrigger) {
      this.addError(
        "error",
        undefined,
        undefined,
        "Workflow must have at least one trigger node",
      );
    }

    // At least one non-trigger node
    const hasAction = this.nodes.some((n) => !this.isTriggerType(n.type));
    if (!hasAction && this.nodes.length > 0) {
      this.addError(
        "warning",
        undefined,
        undefined,
        "Workflow has only trigger, no actions",
      );
    }

    // No duplicate node IDs
    const ids = new Set<string>();
    for (const node of this.nodes) {
      if (ids.has(node.id)) {
        this.addError(
          "error",
          node.id,
          undefined,
          `Duplicate node ID: ${node.id}`,
        );
      }
      ids.add(node.id);
    }

    // All connections reference existing nodes
    for (const conn of this.connections) {
      if (!this.nodeMap.has(conn.from)) {
        this.addError(
          "error",
          undefined,
          undefined,
          `Connection references non-existent source node: ${conn.from}`,
        );
      }
      if (!this.nodeMap.has(conn.to)) {
        this.addError(
          "error",
          undefined,
          undefined,
          `Connection references non-existent target node: ${conn.to}`,
        );
      }
    }

    // No disconnected nodes (except single trigger)
    if (this.nodes.length > 1) {
      for (const node of this.nodes) {
        const hasIncoming = this.connections.some((c) => c.to === node.id);
        const hasOutgoing = this.connections.some((c) => c.from === node.id);
        const isConnected = hasIncoming || hasOutgoing;

        if (!isConnected && !this.isTriggerType(node.type)) {
          this.addError(
            "warning",
            node.id,
            undefined,
            `Node "${node.title}" is disconnected from workflow`,
          );
        }
      }
    }
  }

  // =========================================================================
  // PHASE 2: Individual Node Validation
  // =========================================================================

  private validateNodes(): void {
    for (const node of this.nodes) {
      this.validateNodeRequiredFields(node);
      this.validateNodeData(node);
      this.validateNodeTemplates(node);
    }
  }

  private validateNodeRequiredFields(node: AiWorkflowNode): void {
    const reqs = nodeRequirements[node.type];
    if (!reqs) return;

    for (const req of reqs) {
      if (!req.required) continue;

      const value = node.data[req.field];
      if (!value || (typeof value === "string" && !value.trim())) {
        this.addError(
          "error",
          node.id,
          req.field,
          `Required field "${req.field}" is missing or empty`,
        );
      }
    }
  }

  private validateNodeData(node: AiWorkflowNode): void {
    // Type-specific validation
    switch (node.type) {
      case NodeType.HTTP_REQUEST:
        this.validateHttpNode(node);
        break;
      case NodeType.EMAIL:
        this.validateEmailNode(node);
        break;
      case NodeType.DISCORD:
        this.validateDiscordNode(node);
        break;
      case NodeType.SLACK:
        this.validateSlackNode(node);
        break;
      case NodeType.TELEGRAM:
        this.validateTelegramNode(node);
        break;
      case NodeType.GOOGLE_SHEETS:
        this.validateGoogleSheetsNode(node);
        break;
      case NodeType.OPENAI:
      case NodeType.GEMINI:
      case NodeType.ANTHROPIC:
        this.validateAiNode(node);
        break;
      case NodeType.SCHEDULE_TRIGGER:
        this.validateScheduleNode(node);
        break;
      case NodeType.IF:
        this.validateIfNode(node);
        break;
      case NodeType.WAIT:
        this.validateWaitNode(node);
        break;
      case NodeType.SET:
        this.validateSetNode(node);
        break;
      case NodeType.MERGE:
        this.validateMergeNode(node);
        break;
      case NodeType.LOOP_OVER_ITEMS:
        this.validateLoopNode(node);
        break;
      case NodeType.CODE:
        this.validateCodeNode(node);
        break;
      case NodeType.BROWSER_SCRAPER:
        this.validateBrowserScraperNode(node);
        break;
      case NodeType.RESUME_CV:
        this.validateResumeCvNode(node);
        break;
      case NodeType.RANDOM_DELAY:
        this.validateRandomDelayNode(node);
        break;
      case NodeType.LOGGER:
        this.validateLoggerNode(node);
        break;
      case NodeType.ERROR_HANDLER:
        this.validateErrorHandlerNode(node);
        break;
    }
  }

  private validateScheduleNode(node: AiWorkflowNode): void {
    const mode = String(node.data.mode ?? "daily");
    const validModes = new Set([
      "every_minutes",
      "hourly",
      "daily",
      "weekly",
      "monthly",
      "weekdays_only",
      "custom_cron",
    ]);
    if (!validModes.has(mode)) {
      this.addError("error", node.id, "mode", `Invalid schedule mode: ${mode}`);
      return;
    }

    const timezone = String(node.data.timezone ?? "").trim();
    if (!timezone) {
      this.addError(
        "error",
        node.id,
        "timezone",
        "Schedule trigger timezone is required",
      );
    }

    if (mode === "custom_cron") {
      const expression = String(node.data.cronExpression ?? "").trim();
      if (!expression) {
        this.addError(
          "error",
          node.id,
          "cronExpression",
          "Custom cron mode requires cronExpression",
        );
      }
    }
  }

  private validateHttpNode(node: AiWorkflowNode): void {
    const endpoint = String(node.data.endpoint ?? "");
    if (endpoint && !this.isValidUrl(endpoint) && !this.isTemplate(endpoint)) {
      this.addError("error", node.id, "endpoint", `Invalid URL: ${endpoint}`);
    }

    const method = String(node.data.method ?? "").toUpperCase();
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      this.addError(
        "error",
        node.id,
        "method",
        `Invalid HTTP method: ${method}`,
      );
    }
  }

  private validateIfNode(node: AiWorkflowNode): void {
    const conditionsRaw = Array.isArray(node.data.conditions)
      ? node.data.conditions
      : [];

    if (conditionsRaw.length === 0) {
      const hasLegacyCondition =
        String(node.data.leftValue ?? "").trim().length > 0 &&
        String(node.data.operator ?? "").trim().length > 0;
      if (!hasLegacyCondition) {
        this.addError(
          "error",
          node.id,
          "conditions",
          "IF node requires at least one condition",
        );
      }
      return;
    }

    for (let index = 0; index < conditionsRaw.length; index += 1) {
      const condition = conditionsRaw[index];
      if (!condition || typeof condition !== "object") {
        this.addError(
          "error",
          node.id,
          `conditions.${index}`,
          "Condition entry is invalid",
        );
        continue;
      }

      const conditionRecord = condition as Record<string, unknown>;
      const leftValue = String(conditionRecord.leftValue ?? "").trim();
      const operator = String(conditionRecord.operator ?? "").trim();

      if (!leftValue) {
        this.addError(
          "error",
          node.id,
          `conditions.${index}.leftValue`,
          "Condition leftValue is required",
        );
      }
      if (!operator) {
        this.addError(
          "error",
          node.id,
          `conditions.${index}.operator`,
          "Condition operator is required",
        );
      }
    }
  }

  private validateWaitNode(node: AiWorkflowNode): void {
    const mode = String(node.data.mode ?? "seconds");
    const validModes = new Set([
      "seconds",
      "minutes",
      "hours",
      "until_time",
      "until_datetime",
    ]);
    if (!validModes.has(mode)) {
      this.addError("error", node.id, "mode", `Invalid wait mode: ${mode}`);
      return;
    }

    const timezone = String(node.data.timezone ?? "UTC").trim();
    if (!timezone) {
      this.addError("error", node.id, "timezone", "Wait timezone is required");
    }

    if (mode === "seconds" || mode === "minutes" || mode === "hours") {
      const durationRaw = Number(node.data.duration ?? 0);
      if (!Number.isFinite(durationRaw) || durationRaw <= 0) {
        this.addError(
          "error",
          node.id,
          "duration",
          "Wait duration must be greater than zero",
        );
      }
    }

    if (mode === "until_time" && !String(node.data.time ?? "").trim()) {
      this.addError(
        "error",
        node.id,
        "time",
        "Wait mode 'until_time' requires time",
      );
    }

    if (mode === "until_datetime" && !String(node.data.dateTime ?? "").trim()) {
      this.addError(
        "error",
        node.id,
        "dateTime",
        "Wait mode 'until_datetime' requires dateTime",
      );
    }
  }

  private validateSetNode(node: AiWorkflowNode): void {
    const fields = Array.isArray(node.data.fields) ? node.data.fields : [];
    if (fields.length === 0) {
      this.addError(
        "error",
        node.id,
        "fields",
        "SET node requires at least one field",
      );
      return;
    }

    const seen = new Set<string>();
    for (let index = 0; index < fields.length; index += 1) {
      const item = fields[index];
      if (!item || typeof item !== "object") {
        this.addError(
          "error",
          node.id,
          `fields.${index}`,
          "Field entry is invalid",
        );
        continue;
      }
      const name = String((item as Record<string, unknown>).name ?? "").trim();
      if (!name) {
        this.addError(
          "error",
          node.id,
          `fields.${index}.name`,
          "Field name is required",
        );
      } else {
        const normalized = name.toLowerCase();
        if (seen.has(normalized)) {
          this.addError(
            "error",
            node.id,
            `fields.${index}.name`,
            "Duplicate field name",
          );
        }
        seen.add(normalized);
      }

      const type = String((item as Record<string, unknown>).type ?? "text");
      if (!["text", "number", "boolean", "json", "array"].includes(type)) {
        this.addError(
          "error",
          node.id,
          `fields.${index}.type`,
          "Invalid SET field type",
        );
      }
    }
  }

  private validateMergeNode(node: AiWorkflowNode): void {
    const mode = String(node.data.mode ?? "combine_objects");
    const validModes = new Set([
      "combine_objects",
      "append_arrays",
      "merge_by_index",
      "merge_by_key",
      "wait_for_both",
    ]);
    if (!validModes.has(mode)) {
      this.addError("error", node.id, "mode", `Invalid merge mode: ${mode}`);
    }

    if (!String(node.data.inputAPath ?? "").trim()) {
      this.addError(
        "error",
        node.id,
        "inputAPath",
        "Merge inputAPath is required",
      );
    }
    if (!String(node.data.inputBPath ?? "").trim()) {
      this.addError(
        "error",
        node.id,
        "inputBPath",
        "Merge inputBPath is required",
      );
    }

    if (mode === "merge_by_key" && !String(node.data.keyField ?? "").trim()) {
      this.addError(
        "error",
        node.id,
        "keyField",
        "Merge by key requires keyField",
      );
    }
  }

  private validateLoopNode(node: AiWorkflowNode): void {
    const mode = String(node.data.mode ?? "sequential");
    if (!["sequential", "parallel", "batch"].includes(mode)) {
      this.addError("error", node.id, "mode", `Invalid loop mode: ${mode}`);
    }
    if (!String(node.data.itemsPath ?? "").trim()) {
      this.addError(
        "error",
        node.id,
        "itemsPath",
        "Loop node requires itemsPath",
      );
    }
    const delay = Number(node.data.delayBetweenItemsMs ?? 0);
    if (!Number.isFinite(delay) || delay < 0) {
      this.addError(
        "error",
        node.id,
        "delayBetweenItemsMs",
        "Delay must be >= 0",
      );
    }
    if (mode === "batch") {
      const batchSize = Number(node.data.batchSize ?? 0);
      if (!Number.isFinite(batchSize) || batchSize <= 0) {
        this.addError("error", node.id, "batchSize", "Batch size must be > 0");
      }
    }
    if (node.data.maxItems !== undefined) {
      const maxItems = Number(node.data.maxItems);
      if (!Number.isFinite(maxItems) || maxItems <= 0) {
        this.addError("error", node.id, "maxItems", "Max items must be > 0");
      }
    }
  }

  private validateCodeNode(node: AiWorkflowNode): void {
    const code = String(node.data.code ?? "").trim();
    if (!code) {
      this.addError(
        "error",
        node.id,
        "code",
        "Code node requires JavaScript code",
      );
    }
    const timeout = Number(node.data.timeoutMs ?? 3000);
    if (!Number.isFinite(timeout) || timeout < 250 || timeout > 10000) {
      this.addError(
        "warning",
        node.id,
        "timeoutMs",
        "Code timeout should be between 250 and 10000 ms",
      );
    }
  }

  private validateBrowserScraperNode(node: AiWorkflowNode): void {
    const url = String(node.data.url ?? "").trim();
    if (!url) {
      this.addError("error", node.id, "url", "Browser/Scraper URL is required");
    } else if (!this.isValidUrl(url) && !this.isTemplate(url)) {
      this.addError("error", node.id, "url", "Browser/Scraper URL is invalid");
    }

    const mode = String(node.data.mode ?? "simple_fetch");
    if (!["simple_fetch", "html_scrape", "extract_data"].includes(mode)) {
      this.addError("error", node.id, "mode", `Invalid scraper mode: ${mode}`);
    }

    const timeout = Number(node.data.timeoutMs ?? 15000);
    if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 120000) {
      this.addError(
        "error",
        node.id,
        "timeoutMs",
        "Browser/Scraper timeout must be between 1000 and 120000 ms",
      );
    }

    if (mode === "extract_data") {
      const selectors = Array.isArray(node.data.selectors)
        ? node.data.selectors
        : [];
      if (selectors.length === 0) {
        this.addError(
          "error",
          node.id,
          "selectors",
          "Extract mode requires at least one selector",
        );
      }
    }
  }

  private validateResumeCvNode(node: AiWorkflowNode): void {
    const operation = String(node.data.operation ?? "auto_choose_by_role");
    const validOperations = [
      "upload_resume",
      "select_resume",
      "auto_choose_by_role",
      "output_file",
      "analyze_resume",
    ];
    if (!validOperations.includes(operation)) {
      this.addError(
        "error",
        node.id,
        "operation",
        `Invalid resume operation: ${operation}`,
      );
    }

    const resumes = Array.isArray(node.data.resumes) ? node.data.resumes : [];
    if (resumes.length === 0) {
      this.addError(
        "warning",
        node.id,
        "resumes",
        "No resumes uploaded yet for Resume/CV node",
      );
    }
  }

  private validateRandomDelayNode(node: AiWorkflowNode): void {
    const minDelay = Number(node.data.minDelay ?? 0);
    const maxDelay = Number(node.data.maxDelay ?? 0);
    if (!Number.isFinite(minDelay) || minDelay < 0) {
      this.addError("error", node.id, "minDelay", "Min delay must be >= 0");
    }
    if (!Number.isFinite(maxDelay) || maxDelay < 0) {
      this.addError("error", node.id, "maxDelay", "Max delay must be >= 0");
    }
    if (
      Number.isFinite(minDelay) &&
      Number.isFinite(maxDelay) &&
      maxDelay < minDelay
    ) {
      this.addError(
        "error",
        node.id,
        "maxDelay",
        "Max delay must be >= min delay",
      );
    }
  }

  private validateLoggerNode(node: AiWorkflowNode): void {
    const level = String(node.data.level ?? "info");
    if (!["info", "warning", "error", "debug"].includes(level)) {
      this.addError("error", node.id, "level", `Invalid log level: ${level}`);
    }
  }

  private validateErrorHandlerNode(node: AiWorkflowNode): void {
    const retryCount = Number(node.data.retryCount ?? 0);
    const retryDelaySeconds = Number(node.data.retryDelaySeconds ?? 30);
    if (!Number.isFinite(retryCount) || retryCount < 0) {
      this.addError("error", node.id, "retryCount", "Retry count must be >= 0");
    }
    if (!Number.isFinite(retryDelaySeconds) || retryDelaySeconds < 0) {
      this.addError(
        "error",
        node.id,
        "retryDelaySeconds",
        "Retry delay must be >= 0",
      );
    }
    if (!String(node.data.errorPath ?? "").trim()) {
      this.addError("error", node.id, "errorPath", "Error path is required");
    }
  }

  private validateEmailNode(node: AiWorkflowNode): void {
    const toEmail = String(node.data.toEmail ?? "");
    if (toEmail && !this.isValidEmail(toEmail) && !this.isTemplate(toEmail)) {
      this.addError(
        "error",
        node.id,
        "toEmail",
        `Invalid email address: ${toEmail}`,
      );
    }

    const fromEmail = String(node.data.fromEmail ?? "");
    if (fromEmail && !this.isValidEmail(fromEmail)) {
      this.addError(
        "warning",
        node.id,
        "fromEmail",
        `From email may be invalid: ${fromEmail}`,
      );
    }
  }

  private validateDiscordNode(node: AiWorkflowNode): void {
    const webhook = String(node.data.webhookUrl ?? "");
    if (webhook && !webhook.includes("discord.com/api/webhooks")) {
      this.addError(
        "warning",
        node.id,
        "webhookUrl",
        "Discord webhook URL may be invalid",
      );
    }
  }

  private validateSlackNode(node: AiWorkflowNode): void {
    const webhook = String(node.data.webhookUrl ?? "");
    if (webhook && !webhook.includes("hooks.slack.com")) {
      this.addError(
        "warning",
        node.id,
        "webhookUrl",
        "Slack webhook URL may be invalid",
      );
    }
  }

  private validateGoogleSheetsNode(node: AiWorkflowNode): void {
    const spreadsheetId = String(node.data.spreadsheetId ?? "");
    if (spreadsheetId && spreadsheetId.length < 10) {
      this.addError(
        "warning",
        node.id,
        "spreadsheetId",
        "Spreadsheet ID looks invalid (too short)",
      );
    }
  }

  private validateTelegramNode(node: AiWorkflowNode): void {
    const chatId = String(node.data.chatId ?? "");
    if (
      chatId &&
      !this.isTemplate(chatId) &&
      !/^-?\d+$/.test(chatId) &&
      !chatId.startsWith("@")
    ) {
      this.addError(
        "warning",
        node.id,
        "chatId",
        "Telegram chatId should be numeric or start with @",
      );
    }

    const operation = String(node.data.operation ?? "send_message");
    if (
      operation === "send_message" &&
      !String(node.data.message ?? "").trim()
    ) {
      this.addError(
        "error",
        node.id,
        "message",
        "Telegram send_message operation requires message content",
      );
    }

    if (operation === "send_photo") {
      const source = String(node.data.photoSource ?? "url");
      if (source === "url" && !String(node.data.photoUrl ?? "").trim()) {
        this.addError(
          "error",
          node.id,
          "photoUrl",
          "Telegram send_photo with URL source requires photoUrl",
        );
      }
      if (
        source === "previous_node" &&
        !String(node.data.photoBinaryTemplate ?? "").trim()
      ) {
        this.addError(
          "error",
          node.id,
          "photoBinaryTemplate",
          "Telegram send_photo with previous node source requires photoBinaryTemplate",
        );
      }
      if (source === "upload" && !String(node.data.photoBase64 ?? "").trim()) {
        this.addError(
          "error",
          node.id,
          "photoBase64",
          "Telegram send_photo with upload source requires uploaded file data",
        );
      }
    }

    if (operation === "send_document") {
      const source = String(node.data.documentSource ?? "url");
      if (source === "url" && !String(node.data.documentUrl ?? "").trim()) {
        this.addError(
          "error",
          node.id,
          "documentUrl",
          "Telegram send_document with URL source requires documentUrl",
        );
      }
      if (
        source === "previous_node" &&
        !String(node.data.documentBinaryTemplate ?? "").trim()
      ) {
        this.addError(
          "error",
          node.id,
          "documentBinaryTemplate",
          "Telegram send_document with previous node source requires documentBinaryTemplate",
        );
      }
      if (
        source === "upload" &&
        !String(node.data.documentBase64 ?? "").trim()
      ) {
        this.addError(
          "error",
          node.id,
          "documentBase64",
          "Telegram send_document with upload source requires uploaded file data",
        );
      }
    }
  }

  private validateAiNode(node: AiWorkflowNode): void {
    const userPrompt = String(node.data.userPrompt ?? "");
    if (userPrompt.length < 5) {
      this.addError(
        "warning",
        node.id,
        "userPrompt",
        "User prompt is very short, may not generate useful output",
      );
    }
  }

  private validateNodeTemplates(node: AiWorkflowNode): void {
    // Check all string fields that support templates
    const reqs = nodeRequirements[node.type];
    if (!reqs) return;

    for (const req of reqs) {
      if (!req.canUseTemplate) continue;

      const value = node.data[req.field];
      if (typeof value !== "string") continue;

      if (this.isTemplate(value)) {
        const validation = validateTemplateVariable(
          value,
          this.variableRegistry,
        );
        if (!validation.valid) {
          this.addError(
            "error",
            node.id,
            req.field,
            `Template references undefined variables: {{${validation.missingVariables.join(", ")}}}`,
          );
        }
      }
    }
  }

  // =========================================================================
  // PHASE 3: Connection Validation
  // =========================================================================

  private validateConnections(): void {
    for (const conn of this.connections) {
      const fromNode = this.nodeMap.get(conn.from);
      const toNode = this.nodeMap.get(conn.to);

      if (!fromNode || !toNode) continue;

      // Triggers should only connect to action nodes
      if (
        this.isTriggerType(fromNode.type) &&
        this.isTriggerType(toNode.type)
      ) {
        this.addError(
          "warning",
          conn.from,
          undefined,
          `Trigger connects to another trigger: ${toNode.title}`,
        );
      }

      // Multiple incoming connections should come from same type
      const incomingConnections = this.connections.filter(
        (c) => c.to === toNode.id,
      );
      if (incomingConnections.length > 1) {
        // This is okay for merge operations, just note it
      }
    }

    // Check for cycles (workflows shouldn't loop)
    if (this.hasCycle()) {
      this.addError(
        "error",
        undefined,
        undefined,
        "Workflow contains a cycle (infinite loop)",
      );
    }
  }

  // =========================================================================
  // PHASE 4: Data Flow Validation
  // =========================================================================

  private validateDataFlow(): void {
    // Build execution order
    const sortedNodes = this.topologicalSort();
    if (sortedNodes.length !== this.nodes.length) {
      return; // Cycle detected, already reported
    }

    // Check data availability at each step
    const availableVariables = new Set<string>();

    for (const node of sortedNodes) {
      const schema = nodeOutputSchemas[node.type];
      if (schema) {
        const dynamicName =
          (typeof node.data.variableName === "string" &&
            node.data.variableName.trim()) ||
          (typeof node.data.outputVariableName === "string" &&
            node.data.outputVariableName.trim()) ||
          "";
        const varName = schema.variableName || dynamicName;
        if (varName) {
          availableVariables.add(varName);
        }
      }

      // Verify this node's inputs are available
      const reqs = nodeRequirements[node.type];
      if (reqs) {
        for (const req of reqs) {
          if (!req.canUseTemplate) continue;
          const value = String(node.data[req.field] ?? "");
          if (this.isTemplate(value)) {
            const validation = validateTemplateVariable(
              value,
              this.variableRegistry,
            );
            if (!validation.valid) {
              this.addError(
                "error",
                node.id,
                req.field,
                `At execution time, variable {{${validation.missingVariables[0]}}} would not be available yet`,
              );
            }
          }
        }
      }
    }

    // Warn if final node doesn't output anything useful
    const lastNode = sortedNodes[sortedNodes.length - 1];
    if (lastNode && this.isTriggerType(lastNode.type)) {
      this.addError(
        "warning",
        lastNode.id,
        undefined,
        "Last node is a trigger - workflow may not do anything",
      );
    }
  }

  // =========================================================================
  // PHASE 5: Credential Validation
  // =========================================================================

  private validateCredentials(): void {
    for (const node of this.nodes) {
      const credentialId = node.data.credentialId;

      // Nodes that require credentials
      const requiresCredential =
        node.type === NodeType.EMAIL ||
        node.type === NodeType.GOOGLE_SHEETS ||
        node.type === NodeType.OPENAI ||
        node.type === NodeType.GEMINI ||
        node.type === NodeType.ANTHROPIC ||
        node.type === NodeType.TELEGRAM;

      if (requiresCredential && !credentialId) {
        this.addError(
          "error",
          node.id,
          "credentialId",
          `Node "${node.title}" requires a credential to be selected`,
        );
      }
    }
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  private isTriggerType(type: NodeType): boolean {
    return (
      type === NodeType.MANUAL_TRIGGER ||
      type === NodeType.SCHEDULE_TRIGGER ||
      type === NodeType.GOOGLE_FORM_TRIGGER ||
      type === NodeType.STRIPE_TRIGGER
    );
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private isTemplate(value: string): boolean {
    return /\{\{.+?\}\}/.test(value);
  }

  private hasCycle(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycleDfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const neighbors = this.connections
        .filter((c) => c.from === nodeId)
        .map((c) => c.to);

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycleDfs(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of this.nodes) {
      if (!visited.has(node.id)) {
        if (hasCycleDfs(node.id)) return true;
      }
    }

    return false;
  }

  private topologicalSort(): AiWorkflowNode[] {
    const visited = new Set<string>();
    const sorted: AiWorkflowNode[] = [];
    const visiting = new Set<string>();

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      if (visiting.has(nodeId)) return; // Cycle

      visiting.add(nodeId);
      const neighbors = this.connections
        .filter((c) => c.from === nodeId)
        .map((c) => c.to);

      for (const neighbor of neighbors) {
        visit(neighbor);
      }

      visiting.delete(nodeId);
      visited.add(nodeId);

      const node = this.nodeMap.get(nodeId);
      if (node) sorted.push(node);
    };

    for (const node of this.nodes) {
      visit(node.id);
    }

    return sorted;
  }

  private addError(
    severity: "error" | "warning",
    nodeId: string | undefined,
    field: string | undefined,
    message: string,
  ): void {
    this.errors.push({ severity, nodeId, field, message });
  }
}
