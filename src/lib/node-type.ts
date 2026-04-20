import { NodeType } from "@/generated/prisma";

export const LEGACY_MANUAL_TRIGGER_TYPE = "MANUAL_TRIGGER";
export const MANUAL_TRIGGER_TYPE = NodeType.MANUAL_TRIGGER ?? "MANUAL_TRIGGER";
export const LEGACY_SCHEDULE_TRIGGER_TYPE = "SCHEDULE_TRIGGER";
export const SCHEDULE_TRIGGER_TYPE =
  NodeType.SCHEDULE_TRIGGER ?? "SCHEDULE_TRIGGER";
export const SET_NODE_TYPE = NodeType.SET ?? "SET";
export const MERGE_NODE_TYPE = NodeType.MERGE ?? "MERGE";
export const LOOP_OVER_ITEMS_NODE_TYPE =
  NodeType.LOOP_OVER_ITEMS ?? "LOOP_OVER_ITEMS";
export const CODE_NODE_TYPE = NodeType.CODE ?? "CODE";

export function normalizeNodeType(type: string | null | undefined) {
  if (!type) {
    return type;
  }

  if (type === LEGACY_MANUAL_TRIGGER_TYPE) {
    return MANUAL_TRIGGER_TYPE;
  }

  if (type === LEGACY_SCHEDULE_TRIGGER_TYPE) {
    return SCHEDULE_TRIGGER_TYPE;
  }

  return type;
}

export function isManualTriggerType(type: string | null | undefined) {
  return type === MANUAL_TRIGGER_TYPE || type === LEGACY_MANUAL_TRIGGER_TYPE;
}
