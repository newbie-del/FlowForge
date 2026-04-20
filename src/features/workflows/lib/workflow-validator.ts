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
        const varName = schema.variableName || String(node.data.variableName);
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
