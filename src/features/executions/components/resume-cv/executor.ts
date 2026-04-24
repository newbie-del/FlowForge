import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import { resumeCvNodeChannel } from "@/inngest/channels/resume-cv-node";

type ResumeOperation =
  | "upload_resume"
  | "select_resume"
  | "auto_choose_by_role"
  | "output_file"
  | "analyze_resume";

type ResumeRoleKey = "frontend" | "backend" | "general";

type ResumeEntry = {
  key?: ResumeRoleKey;
  label?: string;
  fileName?: string;
  mimeType?: string;
  base64?: string;
};

type ResumeCvNodeData = {
  operation?: ResumeOperation;
  variableName?: string;
  selectedResumeKey?: ResumeRoleKey;
  jobTitlePath?: string;
  resumes?: ResumeEntry[];
};

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  const safeString = new Handlebars.SafeString(jsonString);
  return safeString;
});

function parsePathToken(value: string) {
  const tokens: string[] = [];
  const pattern = /([^.[\]]+)|\[(\d+)\]/g;
  for (const match of value.matchAll(pattern)) {
    if (match[1]) tokens.push(match[1]);
    else if (match[2]) tokens.push(match[2]);
  }
  return tokens;
}

function getValueByPath(source: unknown, rawPath: string): unknown {
  if (!rawPath) return undefined;
  const tokens = parsePathToken(rawPath.trim());
  let current: unknown = source;
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(token);
      current = Number.isNaN(index) ? undefined : current[index];
      continue;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[token];
      continue;
    }
    return undefined;
  }
  return current;
}

function isSupportedResume(fileName: string, mimeType: string) {
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  if (lowerName.endsWith(".pdf")) return true;
  if (lowerName.endsWith(".docx")) return true;
  return (
    lowerMime.includes("application/pdf") ||
    lowerMime.includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
  );
}

function detectResumeType(fileName: string, mimeType: string) {
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  if (lowerName.endsWith(".pdf") || lowerMime.includes("pdf")) return "pdf";
  if (
    lowerName.endsWith(".docx") ||
    lowerMime.includes("officedocument.wordprocessingml.document")
  )
    return "docx";
  return "unknown";
}

function chooseRoleByJobTitle(jobTitle: string): ResumeRoleKey {
  const lower = jobTitle.toLowerCase();
  if (
    lower.includes("react") ||
    lower.includes("frontend") ||
    lower.includes("front-end") ||
    lower.includes("ui")
  ) {
    return "frontend";
  }
  if (
    lower.includes("node") ||
    lower.includes("backend") ||
    lower.includes("back-end") ||
    lower.includes("api") ||
    lower.includes("server")
  ) {
    return "backend";
  }
  return "general";
}

export const resumeCvExecutor: NodeExecutor<ResumeCvNodeData> = async ({
  data,
  nodeId,
  context,
  publish,
}) => {
  await publish(
    resumeCvNodeChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  try {
    const operation = (data.operation ??
      "auto_choose_by_role") as ResumeOperation;
    const variableName = String(data.variableName ?? "resumeFile").trim();
    const selectedResumeKey = (data.selectedResumeKey ??
      "general") as ResumeRoleKey;
    const jobTitlePath = String(data.jobTitlePath ?? "item.title").trim();

    if (!variableName) {
      throw new NonRetriableError("RESUME/CV node variableName is required.");
    }

    const resumeList = Array.isArray(data.resumes) ? data.resumes : [];
    const resumeByKey = new Map<ResumeRoleKey, ResumeEntry>();
    for (const resume of resumeList) {
      const key = resume.key;
      if (!key) continue;
      resumeByKey.set(key, resume);
    }

    const findResumeByKey = (key: ResumeRoleKey) => {
      const entry = resumeByKey.get(key);
      if (!entry) {
        throw new NonRetriableError(`RESUME/CV node missing "${key}" resume.`);
      }
      const fileName = String(entry.fileName ?? "").trim();
      const mimeType = String(entry.mimeType ?? "").trim();
      const base64 = String(entry.base64 ?? "").trim();
      if (!fileName || !base64) {
        throw new NonRetriableError(
          `RESUME/CV node "${key}" resume file is missing.`,
        );
      }
      if (!isSupportedResume(fileName, mimeType)) {
        throw new NonRetriableError(
          `RESUME/CV node "${key}" resume type is unsupported (PDF/DOCX only).`,
        );
      }
      return {
        ...entry,
        key,
        fileName,
        mimeType,
        base64,
      };
    };

    const resolveJobTitle = () => {
      if (!jobTitlePath) return "";
      const fullTemplatePattern = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
      const fullMatch = jobTitlePath.match(fullTemplatePattern);
      if (fullMatch?.[1]) {
        const path = fullMatch[1].trim();
        const value = getValueByPath(context, path);
        return String(value ?? "");
      }
      if (jobTitlePath.includes("{{")) {
        return String(Handlebars.compile(jobTitlePath)(context));
      }
      const value = getValueByPath(context, jobTitlePath);
      return String(value ?? "");
    };

    const effectiveKey: ResumeRoleKey =
      operation === "auto_choose_by_role"
        ? chooseRoleByJobTitle(resolveJobTitle())
        : selectedResumeKey;

    const selected = findResumeByKey(effectiveKey);
    const resumeType = detectResumeType(selected.fileName, selected.mimeType);
    if (resumeType === "unknown") {
      throw new NonRetriableError(
        "RESUME/CV node selected file type is unsupported.",
      );
    }

    const basePayload = {
      resumeKey: effectiveKey,
      label: String(selected.label ?? effectiveKey),
      fileName: selected.fileName,
      filePath: `node://resume/${effectiveKey}/${encodeURIComponent(selected.fileName)}`,
      mimeType: selected.mimeType || "application/octet-stream",
      type: resumeType,
      sizeBytes: Math.floor((selected.base64.length * 3) / 4),
      base64: selected.base64,
    };

    const output =
      operation === "analyze_resume"
        ? {
            ...basePayload,
            analysis: {
              supportedType: true,
              estimatedPages:
                resumeType === "pdf"
                  ? Math.max(1, Math.ceil(basePayload.sizeBytes / 120000))
                  : undefined,
              recommendedFor:
                effectiveKey === "frontend"
                  ? ["React", "Frontend", "UI"]
                  : effectiveKey === "backend"
                    ? ["Node.js", "Backend", "API"]
                    : ["General roles"],
            },
          }
        : basePayload;

    await publish(
      resumeCvNodeChannel().status({
        nodeId,
        status: "success",
      }),
    );

    return {
      ...context,
      [variableName]: output,
    };
  } catch (error) {
    await publish(
      resumeCvNodeChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
