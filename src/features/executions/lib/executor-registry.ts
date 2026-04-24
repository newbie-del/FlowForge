import { googleFormTriggerExecutor } from "@/features/triggers/components/google-form-trigger/executor";
import { manualTriggerExecutor } from "@/features/triggers/components/manual-trigger/executor";
import { scheduleTriggerExecutor } from "@/features/triggers/components/schedule-trigger/executor";
import { stripeTriggerExecutor } from "@/features/triggers/components/stripe-trigger/executor";
import { NodeType } from "@/generated/prisma";
import { anthropicExecutor } from "../components/anthropic/executor";
import { browserScraperExecutor } from "../components/browser-scraper/executor";
import { codeExecutor } from "../components/code/executor";
import { discordExecutor } from "../components/discord/executor";
import { emailExecutor } from "../components/email/executor";
import { errorHandlerExecutor } from "../components/error-handler/executor";
import { geminiExecutor } from "../components/gemini/executor";
import { googleSheetsExecutor } from "../components/google-sheets/executor";
import { httpRequestExecutor } from "../components/http-request/executor";
import { ifNodeExecutor } from "../components/if/executor";
import { loggerExecutor } from "../components/logger/executor";
import { loopOverItemsExecutor } from "../components/loop-over-items/executor";
import { mergeExecutor } from "../components/merge/executor";
import { openAiExecutor } from "../components/openai/executor";
import { randomDelayExecutor } from "../components/random-delay/executor";
import { resumeCvExecutor } from "../components/resume-cv/executor";
import { setExecutor } from "../components/set/executor";
import { slackExecutor } from "../components/slack/executor";
import { telegramExecutor } from "../components/telegram/executor";
import { waitNodeExecutor } from "../components/wait/executor";
import type { NodeExecutor } from "../types";

export const executorRegistry: Record<NodeType, NodeExecutor> = {
  [NodeType.INITIAL]: manualTriggerExecutor,
  [NodeType.MANUAL_TRIGGER]: manualTriggerExecutor,
  [NodeType.SCHEDULE_TRIGGER]: scheduleTriggerExecutor,
  [NodeType.IF]: ifNodeExecutor,
  [NodeType.WAIT]: waitNodeExecutor,
  [NodeType.SET]: setExecutor,
  [NodeType.MERGE]: mergeExecutor,
  [NodeType.LOOP_OVER_ITEMS]: loopOverItemsExecutor,
  [NodeType.CODE]: codeExecutor,
  [NodeType.BROWSER_SCRAPER]: browserScraperExecutor,
  [NodeType.RESUME_CV]: resumeCvExecutor,
  [NodeType.RANDOM_DELAY]: randomDelayExecutor,
  [NodeType.LOGGER]: loggerExecutor,
  [NodeType.ERROR_HANDLER]: errorHandlerExecutor,
  [NodeType.HTTP_REQUEST]: httpRequestExecutor,
  [NodeType.GOOGLE_FORM_TRIGGER]: googleFormTriggerExecutor,
  [NodeType.STRIPE_TRIGGER]: stripeTriggerExecutor,
  [NodeType.GEMINI]: geminiExecutor,
  [NodeType.ANTHROPIC]: anthropicExecutor,
  [NodeType.OPENAI]: openAiExecutor,
  [NodeType.DISCORD]: discordExecutor,
  [NodeType.SLACK]: slackExecutor,
  [NodeType.EMAIL]: emailExecutor,
  [NodeType.GOOGLE_SHEETS]: googleSheetsExecutor,
  [NodeType.TELEGRAM]: telegramExecutor,
};

export const getExecutor = (type: NodeType): NodeExecutor => {
  const executor = executorRegistry[type];
  if (!executor) {
    throw new Error(`No executor found for node type: ${type}`);
  }

  return executor;
};
