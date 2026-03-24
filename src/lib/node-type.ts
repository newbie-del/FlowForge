import { NodeType } from "@/generated/prisma";

export const LEGACY_MANUAL_TRIGGER_TYPE = "MANUAL_TRIGGER";
export const MANUAL_TRIGGER_TYPE = NodeType.MANUAL_TRIGGER ?? "MANUAL_TRIGGER";

export function normalizeNodeType(type: string | null | undefined) {
  if (!type) {
    return type;
  }

  if (type === LEGACY_MANUAL_TRIGGER_TYPE) {
    return MANUAL_TRIGGER_TYPE;
  }

  return type;
}

export function isManualTriggerType(type: string | null | undefined) {
  return (
    type === MANUAL_TRIGGER_TYPE || type === LEGACY_MANUAL_TRIGGER_TYPE
  );
}
