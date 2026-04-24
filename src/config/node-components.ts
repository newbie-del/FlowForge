import type { NodeTypes } from "@xyflow/react";
import { InitialNode } from "@/components/initial-node";
import { AnthropicNode } from "@/features/executions/components/anthropic/node";
import { BrowserScraperNode } from "@/features/executions/components/browser-scraper/node";
import { CodeNode } from "@/features/executions/components/code/node";
import { DiscordNode } from "@/features/executions/components/discord/node";
import { EmailNode } from "@/features/executions/components/email/node";
import { ErrorHandlerNode } from "@/features/executions/components/error-handler/node";
import { GeminiNode } from "@/features/executions/components/gemini/node";
import { GoogleSheetsNode } from "@/features/executions/components/google-sheets/node";
import { HttpRequestNode } from "@/features/executions/components/http-request/node";
import { IfNode } from "@/features/executions/components/if/node";
import { LoggerNode } from "@/features/executions/components/logger/node";
import { LoopOverItemsNode } from "@/features/executions/components/loop-over-items/node";
import { MergeNode } from "@/features/executions/components/merge/node";
import { OpenAiNode } from "@/features/executions/components/openai/node";
import { RandomDelayNode } from "@/features/executions/components/random-delay/node";
import { ResumeCvNode } from "@/features/executions/components/resume-cv/node";
import { SetNode } from "@/features/executions/components/set/node";
import { SlackNode } from "@/features/executions/components/slack/node";
import { TelegramNode } from "@/features/executions/components/telegram/node";
import { WaitNode } from "@/features/executions/components/wait/node";
import { GoogleFormTrigger } from "@/features/triggers/components/google-form-trigger/node";
import { ManualTriggerNode } from "@/features/triggers/components/manual-trigger/node";
import { ScheduleTriggerNode } from "@/features/triggers/components/schedule-trigger/node";
import { StripeTriggerNode } from "@/features/triggers/components/stripe-trigger/node";
import { NodeType } from "@/generated/prisma";
import {
  BROWSER_SCRAPER_NODE_TYPE,
  CODE_NODE_TYPE,
  ERROR_HANDLER_NODE_TYPE,
  LOGGER_NODE_TYPE,
  LOOP_OVER_ITEMS_NODE_TYPE,
  MERGE_NODE_TYPE,
  RANDOM_DELAY_NODE_TYPE,
  RESUME_CV_NODE_TYPE,
  SET_NODE_TYPE,
} from "@/lib/node-type";

export const nodeComponents = {
  [NodeType.INITIAL]: InitialNode,
  [NodeType.HTTP_REQUEST]: HttpRequestNode,
  [NodeType.MANUAL_TRIGGER]: ManualTriggerNode,
  [NodeType.SCHEDULE_TRIGGER]: ScheduleTriggerNode,
  [NodeType.IF]: IfNode,
  [NodeType.WAIT]: WaitNode,
  [SET_NODE_TYPE]: SetNode,
  [MERGE_NODE_TYPE]: MergeNode,
  [LOOP_OVER_ITEMS_NODE_TYPE]: LoopOverItemsNode,
  [CODE_NODE_TYPE]: CodeNode,
  [BROWSER_SCRAPER_NODE_TYPE]: BrowserScraperNode,
  [RESUME_CV_NODE_TYPE]: ResumeCvNode,
  [RANDOM_DELAY_NODE_TYPE]: RandomDelayNode,
  [LOGGER_NODE_TYPE]: LoggerNode,
  [ERROR_HANDLER_NODE_TYPE]: ErrorHandlerNode,
  [NodeType.GOOGLE_FORM_TRIGGER]: GoogleFormTrigger,
  [NodeType.STRIPE_TRIGGER]: StripeTriggerNode,
  [NodeType.GEMINI]: GeminiNode,
  [NodeType.OPENAI]: OpenAiNode,
  [NodeType.ANTHROPIC]: AnthropicNode,
  [NodeType.DISCORD]: DiscordNode,
  [NodeType.SLACK]: SlackNode,
  [NodeType.EMAIL]: EmailNode,
  [NodeType.GOOGLE_SHEETS]: GoogleSheetsNode,
  [NodeType.TELEGRAM]: TelegramNode,
} as const satisfies NodeTypes;

console.log("[flowforge][nodeComponents]", Object.keys(nodeComponents));

export type RegisteredNodeType = keyof typeof nodeComponents;
